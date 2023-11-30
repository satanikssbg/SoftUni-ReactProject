(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('http'), require('fs'), require('crypto')) :
        typeof define === 'function' && define.amd ? define(['http', 'fs', 'crypto'], factory) :
            (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.Server = factory(global.http, global.fs, global.crypto));
}(this, (function (http, fs, crypto) {
    'use strict';

    function _interopDefaultLegacy(e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

    var http__default = /*#__PURE__*/_interopDefaultLegacy(http);
    var fs__default = /*#__PURE__*/_interopDefaultLegacy(fs);
    var crypto__default = /*#__PURE__*/_interopDefaultLegacy(crypto);

    class ServiceError extends Error {
        constructor(message = 'Service Error') {
            super(message);
            this.name = 'ServiceError';
        }
    }

    class NotFoundError extends ServiceError {
        constructor(message = 'Resource not found') {
            super(message);
            this.name = 'NotFoundError';
            this.status = 404;
        }
    }

    class RequestError extends ServiceError {
        constructor(message = 'Request error') {
            super(message);
            this.name = 'RequestError';
            this.status = 400;
        }
    }

    class ConflictError extends ServiceError {
        constructor(message = 'Resource conflict') {
            super(message);
            this.name = 'ConflictError';
            this.status = 409;
        }
    }

    class AuthorizationError extends ServiceError {
        constructor(message = 'Unauthorized') {
            super(message);
            this.name = 'AuthorizationError';
            this.status = 401;
        }
    }

    class CredentialError extends ServiceError {
        constructor(message = 'Forbidden') {
            super(message);
            this.name = 'CredentialError';
            this.status = 403;
        }
    }

    var errors = {
        ServiceError,
        NotFoundError,
        RequestError,
        ConflictError,
        AuthorizationError,
        CredentialError
    };

    const { ServiceError: ServiceError$1 } = errors;


    function createHandler(plugins, services) {
        return async function handler(req, res) {
            const method = req.method;
            console.info(`<< ${req.method} ${req.url}`);

            // Redirect fix for admin panel relative paths
            if (req.url.slice(-6) == '/admin') {
                res.writeHead(302, {
                    'Location': `http://${req.headers.host}/admin/`
                });
                return res.end();
            }

            let status = 200;
            let headers = {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            };
            let result = '';
            let context;

            // NOTE: the OPTIONS method results in undefined result and also it never processes plugins - keep this in mind
            if (method == 'OPTIONS') {
                Object.assign(headers, {
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
                    'Access-Control-Allow-Credentials': false,
                    'Access-Control-Max-Age': '86400',
                    'Access-Control-Allow-Headers': 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept, X-Authorization, X-Admin'
                });
            } else {
                try {
                    context = processPlugins();
                    await handle(context);
                } catch (err) {
                    if (err instanceof ServiceError$1) {
                        status = err.status || 400;
                        result = composeErrorObject(err.code || status, err.message);
                    } else {
                        // Unhandled exception, this is due to an error in the service code - REST consumers should never have to encounter this;
                        // If it happens, it must be debugged in a future version of the server
                        console.error(err);
                        status = 500;
                        result = composeErrorObject(500, 'Server Error');
                    }
                }
            }

            res.writeHead(status, headers);
            if (context != undefined && context.util != undefined && context.util.throttle) {
                await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
            }
            res.end(result);

            function processPlugins() {
                const context = { params: {} };
                plugins.forEach(decorate => decorate(context, req));
                return context;
            }

            async function handle(context) {
                const { serviceName, tokens, query, body } = await parseRequest(req);
                if (serviceName == 'admin') {
                    return ({ headers, result } = services['admin'](method, tokens, query, body));
                } else if (serviceName == 'favicon.ico') {
                    return ({ headers, result } = services['favicon'](method, tokens, query, body));
                }

                const service = services[serviceName];

                if (service === undefined) {
                    status = 400;
                    result = composeErrorObject(400, `Service "${serviceName}" is not supported`);
                    console.error('Missing service ' + serviceName);
                } else {
                    result = await service(context, { method, tokens, query, body });
                }

                // NOTE: logout does not return a result
                // in this case the content type header should be omitted, to allow checks on the client
                if (result !== undefined) {
                    result = JSON.stringify(result);
                } else {
                    status = 204;
                    delete headers['Content-Type'];
                }
            }
        };
    }



    function composeErrorObject(code, message) {
        return JSON.stringify({
            code,
            message
        });
    }

    async function parseRequest(req) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const tokens = url.pathname.split('/').filter(x => x.length > 0);
        const serviceName = tokens.shift();
        const queryString = url.search.split('?')[1] || '';
        const query = queryString
            .split('&')
            .filter(s => s != '')
            .map(x => x.split('='))
            .reduce((p, [k, v]) => Object.assign(p, { [k]: decodeURIComponent(v) }), {});
        const body = await parseBody(req);

        return {
            serviceName,
            tokens,
            query,
            body
        };
    }

    function parseBody(req) {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', (chunk) => body += chunk.toString());
            req.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (err) {
                    resolve(body);
                }
            });
        });
    }

    var requestHandler = createHandler;

    class Service {
        constructor() {
            this._actions = [];
            this.parseRequest = this.parseRequest.bind(this);
        }

        /**
         * Handle service request, after it has been processed by a request handler
         * @param {*} context Execution context, contains result of middleware processing
         * @param {{method: string, tokens: string[], query: *, body: *}} request Request parameters
         */
        async parseRequest(context, request) {
            for (let { method, name, handler } of this._actions) {
                if (method === request.method && matchAndAssignParams(context, request.tokens[0], name)) {
                    return await handler(context, request.tokens.slice(1), request.query, request.body);
                }
            }
        }

        /**
         * Register service action
         * @param {string} method HTTP method
         * @param {string} name Action name. Can be a glob pattern.
         * @param {(context, tokens: string[], query: *, body: *)} handler Request handler
         */
        registerAction(method, name, handler) {
            this._actions.push({ method, name, handler });
        }

        /**
         * Register GET action
         * @param {string} name Action name. Can be a glob pattern.
         * @param {(context, tokens: string[], query: *, body: *)} handler Request handler
         */
        get(name, handler) {
            this.registerAction('GET', name, handler);
        }

        /**
         * Register POST action
         * @param {string} name Action name. Can be a glob pattern.
         * @param {(context, tokens: string[], query: *, body: *)} handler Request handler
         */
        post(name, handler) {
            this.registerAction('POST', name, handler);
        }

        /**
         * Register PUT action
         * @param {string} name Action name. Can be a glob pattern.
         * @param {(context, tokens: string[], query: *, body: *)} handler Request handler
         */
        put(name, handler) {
            this.registerAction('PUT', name, handler);
        }

        /**
         * Register PATCH action
         * @param {string} name Action name. Can be a glob pattern.
         * @param {(context, tokens: string[], query: *, body: *)} handler Request handler
         */
        patch(name, handler) {
            this.registerAction('PATCH', name, handler);
        }

        /**
         * Register DELETE action
         * @param {string} name Action name. Can be a glob pattern.
         * @param {(context, tokens: string[], query: *, body: *)} handler Request handler
         */
        delete(name, handler) {
            this.registerAction('DELETE', name, handler);
        }
    }

    function matchAndAssignParams(context, name, pattern) {
        if (pattern == '*') {
            return true;
        } else if (pattern[0] == ':') {
            context.params[pattern.slice(1)] = name;
            return true;
        } else if (name == pattern) {
            return true;
        } else {
            return false;
        }
    }

    var Service_1 = Service;

    function uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            let r = Math.random() * 16 | 0,
                v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    var util = {
        uuid
    };

    const uuid$1 = util.uuid;


    const data = fs__default['default'].existsSync('./data') ? fs__default['default'].readdirSync('./data').reduce((p, c) => {
        const content = JSON.parse(fs__default['default'].readFileSync('./data/' + c));
        const collection = c.slice(0, -5);
        p[collection] = {};
        for (let endpoint in content) {
            p[collection][endpoint] = content[endpoint];
        }
        return p;
    }, {}) : {};

    const actions = {
        get: (context, tokens, query, body) => {
            tokens = [context.params.collection, ...tokens];
            let responseData = data;
            for (let token of tokens) {
                if (responseData !== undefined) {
                    responseData = responseData[token];
                }
            }
            return responseData;
        },
        post: (context, tokens, query, body) => {
            tokens = [context.params.collection, ...tokens];
            console.log('Request body:\n', body);

            // TODO handle collisions, replacement
            let responseData = data;
            for (let token of tokens) {
                if (responseData.hasOwnProperty(token) == false) {
                    responseData[token] = {};
                }
                responseData = responseData[token];
            }

            const newId = uuid$1();
            responseData[newId] = Object.assign({}, body, { _id: newId });
            return responseData[newId];
        },
        put: (context, tokens, query, body) => {
            tokens = [context.params.collection, ...tokens];
            console.log('Request body:\n', body);

            let responseData = data;
            for (let token of tokens.slice(0, -1)) {
                if (responseData !== undefined) {
                    responseData = responseData[token];
                }
            }
            if (responseData !== undefined && responseData[tokens.slice(-1)] !== undefined) {
                responseData[tokens.slice(-1)] = body;
            }
            return responseData[tokens.slice(-1)];
        },
        patch: (context, tokens, query, body) => {
            tokens = [context.params.collection, ...tokens];
            console.log('Request body:\n', body);

            let responseData = data;
            for (let token of tokens) {
                if (responseData !== undefined) {
                    responseData = responseData[token];
                }
            }
            if (responseData !== undefined) {
                Object.assign(responseData, body);
            }
            return responseData;
        },
        delete: (context, tokens, query, body) => {
            tokens = [context.params.collection, ...tokens];
            let responseData = data;

            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i];
                if (responseData.hasOwnProperty(token) == false) {
                    return null;
                }
                if (i == tokens.length - 1) {
                    const body = responseData[token];
                    delete responseData[token];
                    return body;
                } else {
                    responseData = responseData[token];
                }
            }
        }
    };

    const dataService = new Service_1();
    dataService.get(':collection', actions.get);
    dataService.post(':collection', actions.post);
    dataService.put(':collection', actions.put);
    dataService.patch(':collection', actions.patch);
    dataService.delete(':collection', actions.delete);


    var jsonstore = dataService.parseRequest;

    /*
     * This service requires storage and auth plugins
     */

    const { AuthorizationError: AuthorizationError$1 } = errors;



    const userService = new Service_1();

    userService.get('me', getSelf);
    userService.post('register', onRegister);
    userService.post('login', onLogin);
    userService.get('logout', onLogout);


    function getSelf(context, tokens, query, body) {
        if (context.user) {
            const result = Object.assign({}, context.user);
            delete result.hashedPassword;
            return result;
        } else {
            throw new AuthorizationError$1();
        }
    }

    function onRegister(context, tokens, query, body) {
        return context.auth.register(body);
    }

    function onLogin(context, tokens, query, body) {
        return context.auth.login(body);
    }

    function onLogout(context, tokens, query, body) {
        return context.auth.logout();
    }

    var users = userService.parseRequest;

    const { NotFoundError: NotFoundError$1, RequestError: RequestError$1 } = errors;


    var crud = {
        get,
        post,
        put,
        patch,
        delete: del
    };


    function validateRequest(context, tokens, query) {
        /*
        if (context.params.collection == undefined) {
            throw new RequestError('Please, specify collection name');
        }
        */
        if (tokens.length > 1) {
            throw new RequestError$1();
        }
    }

    function parseWhere(query) {
        const operators = {
            '<=': (prop, value) => record => record[prop] <= JSON.parse(value),
            '<': (prop, value) => record => record[prop] < JSON.parse(value),
            '>=': (prop, value) => record => record[prop] >= JSON.parse(value),
            '>': (prop, value) => record => record[prop] > JSON.parse(value),
            '=': (prop, value) => record => record[prop] == JSON.parse(value),
            ' like ': (prop, value) => record => record[prop].toLowerCase().includes(JSON.parse(value).toLowerCase()),
            ' in ': (prop, value) => record => JSON.parse(`[${/\((.+?)\)/.exec(value)[1]}]`).includes(record[prop]),
        };
        const pattern = new RegExp(`^(.+?)(${Object.keys(operators).join('|')})(.+?)$`, 'i');

        try {
            let clauses = [query.trim()];
            let check = (a, b) => b;
            let acc = true;
            if (query.match(/ and /gi)) {
                // inclusive
                clauses = query.split(/ and /gi);
                check = (a, b) => a && b;
                acc = true;
            } else if (query.match(/ or /gi)) {
                // optional
                clauses = query.split(/ or /gi);
                check = (a, b) => a || b;
                acc = false;
            }
            clauses = clauses.map(createChecker);

            return (record) => clauses
                .map(c => c(record))
                .reduce(check, acc);
        } catch (err) {
            throw new Error('Could not parse WHERE clause, check your syntax.');
        }

        function createChecker(clause) {
            let [match, prop, operator, value] = pattern.exec(clause);
            [prop, value] = [prop.trim(), value.trim()];

            return operators[operator.toLowerCase()](prop, value);
        }
    }


    function get(context, tokens, query, body) {
        validateRequest(context, tokens);

        let responseData;

        try {
            if (query.where) {
                responseData = context.storage.get(context.params.collection).filter(parseWhere(query.where));
            } else if (context.params.collection) {
                responseData = context.storage.get(context.params.collection, tokens[0]);
            } else {
                // Get list of collections
                return context.storage.get();
            }

            if (query.sortBy) {
                const props = query.sortBy
                    .split(',')
                    .filter(p => p != '')
                    .map(p => p.split(' ').filter(p => p != ''))
                    .map(([p, desc]) => ({ prop: p, desc: desc ? true : false }));

                // Sorting priority is from first to last, therefore we sort from last to first
                for (let i = props.length - 1; i >= 0; i--) {
                    let { prop, desc } = props[i];
                    responseData.sort(({ [prop]: propA }, { [prop]: propB }) => {
                        if (typeof propA == 'number' && typeof propB == 'number') {
                            return (propA - propB) * (desc ? -1 : 1);
                        } else {
                            return propA.localeCompare(propB) * (desc ? -1 : 1);
                        }
                    });
                }
            }

            if (query.offset) {
                responseData = responseData.slice(Number(query.offset) || 0);
            }
            const pageSize = Number(query.pageSize) || 10;
            if (query.pageSize) {
                responseData = responseData.slice(0, pageSize);
            }

            if (query.distinct) {
                const props = query.distinct.split(',').filter(p => p != '');
                responseData = Object.values(responseData.reduce((distinct, c) => {
                    const key = props.map(p => c[p]).join('::');
                    if (distinct.hasOwnProperty(key) == false) {
                        distinct[key] = c;
                    }
                    return distinct;
                }, {}));
            }

            if (query.count) {
                return responseData.length;
            }

            if (query.select) {
                const props = query.select.split(',').filter(p => p != '');
                responseData = Array.isArray(responseData) ? responseData.map(transform) : transform(responseData);

                function transform(r) {
                    const result = {};
                    props.forEach(p => result[p] = r[p]);
                    return result;
                }
            }

            if (query.load) {
                const props = query.load.split(',').filter(p => p != '');
                props.map(prop => {
                    const [propName, relationTokens] = prop.split('=');
                    const [idSource, collection] = relationTokens.split(':');
                    console.log(`Loading related records from "${collection}" into "${propName}", joined on "_id"="${idSource}"`);
                    const storageSource = collection == 'users' ? context.protectedStorage : context.storage;
                    responseData = Array.isArray(responseData) ? responseData.map(transform) : transform(responseData);

                    function transform(r) {
                        const seekId = r[idSource];
                        const related = storageSource.get(collection, seekId);
                        delete related.hashedPassword;
                        r[propName] = related;
                        return r;
                    }
                });
            }

        } catch (err) {
            console.error(err);
            if (err.message.includes('does not exist')) {
                throw new NotFoundError$1();
            } else {
                throw new RequestError$1(err.message);
            }
        }

        context.canAccess(responseData);

        return responseData;
    }

    function post(context, tokens, query, body) {
        console.log('Request body:\n', body);

        validateRequest(context, tokens);
        if (tokens.length > 0) {
            throw new RequestError$1('Use PUT to update records');
        }
        context.canAccess(undefined, body);

        body._ownerId = context.user._id;
        let responseData;

        try {
            responseData = context.storage.add(context.params.collection, body);
        } catch (err) {
            throw new RequestError$1();
        }

        return responseData;
    }

    function put(context, tokens, query, body) {
        console.log('Request body:\n', body);

        validateRequest(context, tokens);
        if (tokens.length != 1) {
            throw new RequestError$1('Missing entry ID');
        }

        let responseData;
        let existing;

        try {
            existing = context.storage.get(context.params.collection, tokens[0]);
        } catch (err) {
            throw new NotFoundError$1();
        }

        context.canAccess(existing, body);

        try {
            responseData = context.storage.set(context.params.collection, tokens[0], body);
        } catch (err) {
            throw new RequestError$1();
        }

        return responseData;
    }

    function patch(context, tokens, query, body) {
        console.log('Request body:\n', body);

        validateRequest(context, tokens);
        if (tokens.length != 1) {
            throw new RequestError$1('Missing entry ID');
        }

        let responseData;
        let existing;

        try {
            existing = context.storage.get(context.params.collection, tokens[0]);
        } catch (err) {
            throw new NotFoundError$1();
        }

        context.canAccess(existing, body);

        try {
            responseData = context.storage.merge(context.params.collection, tokens[0], body);
        } catch (err) {
            throw new RequestError$1();
        }

        return responseData;
    }

    function del(context, tokens, query, body) {
        validateRequest(context, tokens);
        if (tokens.length != 1) {
            throw new RequestError$1('Missing entry ID');
        }

        let responseData;
        let existing;

        try {
            existing = context.storage.get(context.params.collection, tokens[0]);
        } catch (err) {
            throw new NotFoundError$1();
        }

        context.canAccess(existing);

        try {
            responseData = context.storage.delete(context.params.collection, tokens[0]);
        } catch (err) {
            throw new RequestError$1();
        }

        return responseData;
    }

    /*
     * This service requires storage and auth plugins
     */

    const dataService$1 = new Service_1();
    dataService$1.get(':collection', crud.get);
    dataService$1.post(':collection', crud.post);
    dataService$1.put(':collection', crud.put);
    dataService$1.patch(':collection', crud.patch);
    dataService$1.delete(':collection', crud.delete);

    var data$1 = dataService$1.parseRequest;

    const imgdata = 'iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAPNnpUWHRSYXcgcHJvZmlsZSB0eXBlIGV4aWYAAHja7ZpZdiS7DUT/uQovgSQ4LofjOd6Bl+8LZqpULbWm7vdnqyRVKQeCBAKBAFNm/eff2/yLr2hzMSHmkmpKlq9QQ/WND8VeX+38djac3+cr3af4+5fj5nHCc0h4l+vP8nJicdxzeN7Hxz1O43h8Gmi0+0T/9cT09/jlNuAeBs+XuMuAvQ2YeQ8k/jrhwj2Re3mplvy8hH3PKPr7SLl+jP6KkmL2OeErPnmbQ9q8Rmb0c2ynxafzO+eET7mC65JPjrM95exN2jmmlYLnophSTKLDZH+GGAwWM0cyt3C8nsHWWeG4Z/Tio7cHQiZ2M7JK8X6JE3t++2v5oj9O2nlvfApc50SkGQ5FDnm5B2PezJ8Bw1PUPvl6cYv5G788u8V82y/lPTgfn4CC+e2JN+Ds5T4ubzCVHu8M9JsTLr65QR5m/LPhvh6G/S8zcs75XzxZXn/2nmXvda2uhURs051x51bzMgwXdmIl57bEK/MT+ZzPq/IqJPEA+dMO23kNV50HH9sFN41rbrvlJu/DDeaoMci8ez+AjB4rkn31QxQxQV9u+yxVphRgM8CZSDDiH3Nxx2499oYrWJ6OS71jMCD5+ct8dcF3XptMNupie4XXXQH26nCmoZHT31xGQNy+4xaPg19ejy/zFFghgvG4ubDAZvs1RI/uFVtyACBcF3m/0sjlqVHzByUB25HJOCEENjmJLjkL2LNzQXwhQI2Ze7K0EwEXo59M0geRRGwKOMI292R3rvXRX8fhbuJDRkomNlUawQohgp8cChhqUWKIMZKxscQamyEBScaU0knM1E6WxUxO5pJrbkVKKLGkkksptbTqq1AjYiWLa6m1tobNFkyLjbsbV7TWfZceeuyp51567W0AnxFG1EweZdTRpp8yIayZZp5l1tmWI6fFrLDiSiuvsupqG6xt2WFHOCXvsutuj6jdUX33+kHU3B01fyKl1+VH1Diasw50hnDKM1FjRsR8cEQ8awQAtNeY2eJC8Bo5jZmtnqyInklGjc10thmXCGFYzsftHrF7jdy342bw9Vdx89+JnNHQ/QOR82bJm7j9JmqnGo8TsSsL1adWyD7Or9J8aTjbXx/+9v3/A/1vDUS9tHOXtLaM6JoBquRHJFHdaNU5oF9rKVSjYNewoFNsW032cqqCCx/yljA2cOy7+7zJ0biaicv1TcrWXSDXVT3SpkldUqqPIJj8p9oeWVs4upKL3ZHgpNzYnTRv5EeTYXpahYRgfC+L/FyxBphCmPLK3W1Zu1QZljTMJe5AIqmOyl0qlaFCCJbaPAIMWXzurWAMXiB1fGDtc+ld0ZU12k5cQq4v7+AB2x3qLlQ3hyU/uWdzzgUTKfXSputZRtp97hZ3z4EE36WE7WtjbqMtMr912oRp47HloZDlywxJ+uyzmrW91OivysrM1Mt1rZbrrmXm2jZrYWVuF9xZVB22jM4ccdaE0kh5jIrnzBy5w6U92yZzS1wrEao2ZPnE0tL0eRIpW1dOWuZ1WlLTqm7IdCESsV5RxjQ1/KWC/y/fPxoINmQZI8Cli9oOU+MJYgrv006VQbRGC2Ug8TYzrdtUHNjnfVc6/oN8r7tywa81XHdZN1QBUhfgzRLzmPCxu1G4sjlRvmF4R/mCYdUoF2BYNMq4AjD2GkMGhEt7PAJfKrH1kHmj8eukyLb1oCGW/WdAtx0cURYqtcGnNlAqods6UnaRpY3LY8GFbPeSrjKmsvhKnWTtdYKhRW3TImUqObdpGZgv3ltrdPwwtD+l1FD/htxAwjdUzhtIkWNVy+wBUmDtphwgVemd8jV1miFXWTpumqiqvnNuArCrFMbLPexJYpABbamrLiztZEIeYPasgVbnz9/NZxe4p/B+FV3zGt79B9S0Jc0Lu+YH4FXsAsa2YnRIAb2thQmGc17WdNd9cx4+y4P89EiVRKB+CvRkiPTwM7Ts+aZ5aV0C4zGoqyOGJv3yGMJaHXajKbOGkm40Ychlkw6c6hZ4s+SDJpsmncwmm8ChEmBWspX8MkFB+kzF1ZlgoGWiwzY6w4AIPDOcJxV3rtUnabEgoNBB4MbNm8GlluVIpsboaKl0YR8kGnXZH3JQZrH2MDxxRrHFUduh+CvQszakraM9XNo7rEVjt8VpbSOnSyD5dwLfVI4+Sl+DCZc5zU6zhrXnRhZqUowkruyZupZEm/dA2uVTroDg1nfdJMBua9yCJ8QPtGw2rkzlYLik5SBzUGSoOqBMJvwTe92eGgOVx8/T39TP0r/PYgfkP1IEyGVhYHXyJiVPU0skB3dGqle6OZuwj/Hw5c2gV5nEM6TYaAryq3CRXsj1088XNwt0qcliqNc6bfW+TttRydKpeJOUWTmmUiwJKzpr6hkVzzLrVs+s66xEiCwOzfg5IRgwQgFgrriRlg6WQS/nGyRUNDjulWsUbO8qu/lWaWeFe8QTs0puzrxXH1H0b91KgDm2dkdrpkpx8Ks2zZu4K1GHPpDxPdCL0RH0SZZrGX8hRKTA+oUPzQ+I0K1C16ZSK6TR28HUdlnfpzMsIvd4TR7iuSe/+pn8vief46IQULRGcHvRVUyn9aYeoHbGhEbct+vEuzIxhxJrgk1oyo3AFA7eSSSNI/Vxl0eLMCrJ/j1QH0ybj0C9VCn9BtXbz6Kd10b8QKtpTnecbnKHWZxcK2OiKCuViBHqrzM2T1uFlGJlMKFKRF1Zy6wMqQYtgKYc4PFoGv2dX2ixqGaoFDhjzRmp4fsygFZr3t0GmBqeqbcBFpvsMVCNajVWcLRaPBhRKc4RCCUGZphKJdisKdRjDKdaNbZfwM5BulzzCvyv0AsAlu8HOAdIXAuMAg0mWa0+0vgrODoHlm7Y7rXUHmm9r2RTLpXwOfOaT6iZdASpqOIXfiABLwQkrSPFXQgAMHjYyEVrOBESVgS4g4AxcXyiPwBiCF6g2XTPk0hqn4D67rbQVFv0Lam6Vfmvq90B3WgV+peoNRb702/tesrImcBCvIEaGoI/8YpKa1XmDNr1aGUwjDETBa3VkOLYVLGKeWQcd+WaUlsMdTdUg3TcUPvdT20ftDW4+injyAarDRVVRgc906sNTo1cu7LkDGewjkQ35Z7l4Htnx9MCkbenKiNMsif+5BNVnA6op3gZVZtjIAacNia+00w1ZutIibTMOJ7IISctvEQGDxEYDUSxUiH4R4kkH86dMywCqVJ2XpzkUYUgW3mDPmz0HLW6w9daRn7abZmo4QR5i/A21r4oEvCC31oajm5CR1yBZcIfN7rmgxM9qZBhXh3C6NR9dCS1PTMJ30c4fEcwkq0IXdphpB9eg4x1zycsof4t6C4jyS68eW7OonpSEYCzb5dWjQH3H5fWq2SH41O4LahPrSJA77KqpJYwH6pdxDfDIgxLR9GptCKMoiHETrJ0wFSR3Sk7yI97KdBVSHXeS5FBnYKIz1JU6VhdCkfHIP42o0V6aqgg00JtZfdK6hPeojtXvgfnE/VX0p0+fqxp2/nDfvBuHgeo7ppkrr/MyU1dT73n5B/qi76+lzMnVnHRJDeZOyj3XXdQrrtOUPQunDqgDlz+iuS3QDafITkJd050L0Hi2kiRBX52pIVso0ZpW1YQsT2VRgtxm9iiqU2qXyZ0OdvZy0J1gFotZFEuGrnt3iiiXvECX+UcWBqpPlgLRkdN7cpl8PxDjWseAu1bPdCjBSrQeVD2RHE7bRhMb1Qd3VHVXVNBewZ3Wm7avbifhB+4LNQrmp0WxiCNkm7dd7mV39SnokrvfzIr+oDSFq1D76MZchw6Vl4Z67CL01I6ZiX/VEqfM1azjaSkKqC+kx67tqTg5ntLii5b96TAA3wMTx2NvqsyyUajYQHJ1qkpmzHQITXDUZRGTYtNw9uLSndMmI9tfMdEeRgwWHB7NlosyivZPlvT5KIOc+GefU9UhA4MmKFXmhAuJRFVWHRJySbREImpQysz4g3uJckihD7P84nWtLo7oR4tr8IKdSBXYvYaZnm3ffhh9nyWPDa+zQfzdULsFlr/khrMb7hhAroOKSZgxbUzqdiVIhQc+iZaTbpesLXSbIfbjwXTf8AjbnV6kTpD4ZsMdXMK45G1NRiMdh/bLb6oXX+4rWHen9BW+xJDV1N+i6HTlKdLDMnVkx8tdHryus3VlCOXXKlDIiuOkimXnmzmrtbGqmAHL1TVXU73PX5nx3xhSO3QKtBqbd31iQHHBNXXrYIXHVyQqDGIcc6qHEcz2ieN+radKS9br/cGzC0G7g0YFQPGdqs7MI6pOt2BgYtt/4MNW8NJ3VT5es/izZZFd9yIfwY1lUubGSSnPiWWzDpAN+sExNptEoBx74q8bAzdFu6NocvC2RgK2WR7doZodiZ6OgoUrBoWIBM2xtMHXUX3GGktr5RtwPZ9tTWfleFP3iEc2hTar6IC1Y55ktYKQtXTsKkfgQ+al0aXBCh2dlCxdBtLtc8QJ4WUKIX+jlRR/TN9pXpNA1bUC7LaYUzJvxr6rh2Q7ellILBd0PcFF5F6uArA6ODZdjQYosZpf7lbu5kNFfbGUUY5C2p7esLhhjw94Miqk+8tDPgTVXX23iliu782KzsaVdexRSq4NORtmY3erV/NFsJU9S7naPXmPGLYvuy5USQA2pcb4z/fYafpPj0t5HEeD1y7W/Z+PHA2t8L1eGCCeFS/Ph04Hafu+Uf8ly2tjUNDQnNUIOqVLrBLIwxK67p3fP7LaX/LjnlniCYv6jNK0ce5YrPud1Gc6LQWg+sumIt2hCCVG3e8e5tsLAL2qWekqp1nKPKqKIJcmxO3oljxVa1TXVDVWmxQ/lhHHnYNP9UDrtFdwekRKCueDRSRAYoo0nEssbG3znTTDahVUXyDj+afeEhn3w/UyY0fSv5b8ZuSmaDVrURYmBrf0ZgIMOGuGFNG3FH45iA7VFzUnj/odcwHzY72OnQEhByP3PtKWxh/Q+/hkl9x5lEic5ojDGgEzcSpnJEwY2y6ZN0RiyMBhZQ35AigLvK/dt9fn9ZJXaHUpf9Y4IxtBSkanMxxP6xb/pC/I1D1icMLDcmjZlj9L61LoIyLxKGRjUcUtOiFju4YqimZ3K0odbd1Usaa7gPp/77IJRuOmxAmqhrWXAPOftoY0P/BsgifTmC2ChOlRSbIMBjjm3bQIeahGwQamM9wHqy19zaTCZr/AtjdNfWMu8SZAAAA13pUWHRSYXcgcHJvZmlsZSB0eXBlIGlwdGMAAHjaPU9LjkMhDNtzijlCyMd5HKflgdRdF72/xmFGJSIEx9ihvd6f2X5qdWizy9WH3+KM7xrRp2iw6hLARIfnSKsqoRKGSEXA0YuZVxOx+QcnMMBKJR2bMdNUDraxWJ2ciQuDDPKgNDA8kakNOwMLriTRO2Alk3okJsUiidC9Ex9HbNUMWJz28uQIzhhNxQduKhdkujHiSJVTCt133eqpJX/6MDXh7nrXydzNq9tssr14NXuwFXaoh/CPiLRfLvxMyj3GtTgAAAGFaUNDUElDQyBwcm9maWxlAAB4nH2RPUjDQBzFX1NFKfUD7CDikKE6WRAVESepYhEslLZCqw4ml35Bk4YkxcVRcC04+LFYdXBx1tXBVRAEP0Dc3JwUXaTE/yWFFjEeHPfj3b3H3TtAqJeZanaMA6pmGclYVMxkV8WuVwjoRQCz6JeYqcdTi2l4jq97+Ph6F+FZ3uf+HD1KzmSATySeY7phEW8QT29aOud94hArSgrxOfGYQRckfuS67PIb54LDAs8MGenkPHGIWCy0sdzGrGioxFPEYUXVKF/IuKxw3uKslquseU/+wmBOW0lxneYwYlhCHAmIkFFFCWVYiNCqkWIiSftRD/+Q40+QSyZXCYwcC6hAheT4wf/gd7dmfnLCTQpGgc4X2/4YAbp2gUbNtr+PbbtxAvifgSut5a/UgZlP0mstLXwE9G0DF9ctTd4DLneAwSddMiRH8tMU8nng/Yy+KQsM3AKBNbe35j5OH4A0dbV8AxwcAqMFyl73eHd3e2//nmn29wOGi3Kv+RixSgAAEkxpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+Cjx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IlhNUCBDb3JlIDQuNC4wLUV4aXYyIj4KIDxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+CiAgPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIKICAgIHhtbG5zOmlwdGNFeHQ9Imh0dHA6Ly9pcHRjLm9yZy9zdGQvSXB0YzR4bXBFeHQvMjAwOC0wMi0yOS8iCiAgICB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIKICAgIHhtbG5zOnN0RXZ0PSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VFdmVudCMiCiAgICB4bWxuczpwbHVzPSJodHRwOi8vbnMudXNlcGx1cy5vcmcvbGRmL3htcC8xLjAvIgogICAgeG1sbnM6R0lNUD0iaHR0cDovL3d3dy5naW1wLm9yZy94bXAvIgogICAgeG1sbnM6ZGM9Imh0dHA6Ly9wdXJsLm9yZy9kYy9lbGVtZW50cy8xLjEvIgogICAgeG1sbnM6cGhvdG9zaG9wPSJodHRwOi8vbnMuYWRvYmUuY29tL3Bob3Rvc2hvcC8xLjAvIgogICAgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIgogICAgeG1sbnM6eG1wUmlnaHRzPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvcmlnaHRzLyIKICAgeG1wTU06RG9jdW1lbnRJRD0iZ2ltcDpkb2NpZDpnaW1wOjdjZDM3NWM3LTcwNmItNDlkMy1hOWRkLWNmM2Q3MmMwY2I4ZCIKICAgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDo2NGY2YTJlYy04ZjA5LTRkZTMtOTY3ZC05MTUyY2U5NjYxNTAiCiAgIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDoxMmE1NzI5Mi1kNmJkLTRlYjQtOGUxNi1hODEzYjMwZjU0NWYiCiAgIEdJTVA6QVBJPSIyLjAiCiAgIEdJTVA6UGxhdGZvcm09IldpbmRvd3MiCiAgIEdJTVA6VGltZVN0YW1wPSIxNjEzMzAwNzI5NTMwNjQzIgogICBHSU1QOlZlcnNpb249IjIuMTAuMTIiCiAgIGRjOkZvcm1hdD0iaW1hZ2UvcG5nIgogICBwaG90b3Nob3A6Q3JlZGl0PSJHZXR0eSBJbWFnZXMvaVN0b2NrcGhvdG8iCiAgIHhtcDpDcmVhdG9yVG9vbD0iR0lNUCAyLjEwIgogICB4bXBSaWdodHM6V2ViU3RhdGVtZW50PSJodHRwczovL3d3dy5pc3RvY2twaG90by5jb20vbGVnYWwvbGljZW5zZS1hZ3JlZW1lbnQ/dXRtX21lZGl1bT1vcmdhbmljJmFtcDt1dG1fc291cmNlPWdvb2dsZSZhbXA7dXRtX2NhbXBhaWduPWlwdGN1cmwiPgogICA8aXB0Y0V4dDpMb2NhdGlvbkNyZWF0ZWQ+CiAgICA8cmRmOkJhZy8+CiAgIDwvaXB0Y0V4dDpMb2NhdGlvbkNyZWF0ZWQ+CiAgIDxpcHRjRXh0OkxvY2F0aW9uU2hvd24+CiAgICA8cmRmOkJhZy8+CiAgIDwvaXB0Y0V4dDpMb2NhdGlvblNob3duPgogICA8aXB0Y0V4dDpBcnR3b3JrT3JPYmplY3Q+CiAgICA8cmRmOkJhZy8+CiAgIDwvaXB0Y0V4dDpBcnR3b3JrT3JPYmplY3Q+CiAgIDxpcHRjRXh0OlJlZ2lzdHJ5SWQ+CiAgICA8cmRmOkJhZy8+CiAgIDwvaXB0Y0V4dDpSZWdpc3RyeUlkPgogICA8eG1wTU06SGlzdG9yeT4KICAgIDxyZGY6U2VxPgogICAgIDxyZGY6bGkKICAgICAgc3RFdnQ6YWN0aW9uPSJzYXZlZCIKICAgICAgc3RFdnQ6Y2hhbmdlZD0iLyIKICAgICAgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDpjOTQ2M2MxMC05OWE4LTQ1NDQtYmRlOS1mNzY0ZjdhODJlZDkiCiAgICAgIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkdpbXAgMi4xMCAoV2luZG93cykiCiAgICAgIHN0RXZ0OndoZW49IjIwMjEtMDItMTRUMTM6MDU6MjkiLz4KICAgIDwvcmRmOlNlcT4KICAgPC94bXBNTTpIaXN0b3J5PgogICA8cGx1czpJbWFnZVN1cHBsaWVyPgogICAgPHJkZjpTZXEvPgogICA8L3BsdXM6SW1hZ2VTdXBwbGllcj4KICAgPHBsdXM6SW1hZ2VDcmVhdG9yPgogICAgPHJkZjpTZXEvPgogICA8L3BsdXM6SW1hZ2VDcmVhdG9yPgogICA8cGx1czpDb3B5cmlnaHRPd25lcj4KICAgIDxyZGY6U2VxLz4KICAgPC9wbHVzOkNvcHlyaWdodE93bmVyPgogICA8cGx1czpMaWNlbnNvcj4KICAgIDxyZGY6U2VxPgogICAgIDxyZGY6bGkKICAgICAgcGx1czpMaWNlbnNvclVSTD0iaHR0cHM6Ly93d3cuaXN0b2NrcGhvdG8uY29tL3Bob3RvL2xpY2Vuc2UtZ20xMTUwMzQ1MzQxLT91dG1fbWVkaXVtPW9yZ2FuaWMmYW1wO3V0bV9zb3VyY2U9Z29vZ2xlJmFtcDt1dG1fY2FtcGFpZ249aXB0Y3VybCIvPgogICAgPC9yZGY6U2VxPgogICA8L3BsdXM6TGljZW5zb3I+CiAgIDxkYzpjcmVhdG9yPgogICAgPHJkZjpTZXE+CiAgICAgPHJkZjpsaT5WbGFkeXNsYXYgU2VyZWRhPC9yZGY6bGk+CiAgICA8L3JkZjpTZXE+CiAgIDwvZGM6Y3JlYXRvcj4KICAgPGRjOmRlc2NyaXB0aW9uPgogICAgPHJkZjpBbHQ+CiAgICAgPHJkZjpsaSB4bWw6bGFuZz0ieC1kZWZhdWx0Ij5TZXJ2aWNlIHRvb2xzIGljb24gb24gd2hpdGUgYmFja2dyb3VuZC4gVmVjdG9yIGlsbHVzdHJhdGlvbi48L3JkZjpsaT4KICAgIDwvcmRmOkFsdD4KICAgPC9kYzpkZXNjcmlwdGlvbj4KICA8L3JkZjpEZXNjcmlwdGlvbj4KIDwvcmRmOlJERj4KPC94OnhtcG1ldGE+CiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAKPD94cGFja2V0IGVuZD0idyI/PmWJCnkAAAAGYktHRAD/AP8A/6C9p5MAAAAJcEhZcwAALiMAAC4jAXilP3YAAAAHdElNRQflAg4LBR0CZnO/AAAARHRFWHRDb21tZW50AFNlcnZpY2UgdG9vbHMgaWNvbiBvbiB3aGl0ZSBiYWNrZ3JvdW5kLiBWZWN0b3IgaWxsdXN0cmF0aW9uLlwvEeIAAAMxSURBVHja7Z1bcuQwCEX7qrLQXlp2ynxNVWbK7dgWj3sl9JvYRhxACD369erW7UMzx/cYaychonAQvXM5ABYkpynoYIiEGdoQog6AYfywBrCxF4zNrX/7McBbuXJe8rXx/KBDULcGsMREzCbeZ4J6ME/9wVH5d95rogZp3npEgPLP3m2iUSGqXBJS5Dr6hmLm8kRuZABYti5TMaailV8LodNQwTTUWk4/WZk75l0kM0aZQdaZjMqkrQDAuyMVJWFjMB4GANXr0lbZBxQKr7IjI7QvVWkok/Jn5UHVh61CYPs+/i7eL9j3y/Au8WqoAIC34k8/9k7N8miLcaGWHwgjZXE/awyYX7h41wKMCskZM2HXAddDkTdglpSjz5bcKPbcCEKwT3+DhxtVpJvkEC7rZSgq32NMSBoXaCdiahDCKrND0fpX8oQlVsQ8IFQZ1VARdIF5wroekAjB07gsAgDUIbQHFENIDEX4CQANIVe8Iw/ASiACLXl28eaf579OPuBa9/mrELUYHQ1t3KHlZZnRcXb2/c7ygXIQZqjDMEzeSrOgCAhqYMvTUE+FKXoVxTxgk3DEPREjGzj3nAk/VaKyB9GVIu4oMyOlrQZgrBBEFG9PAZTfs3amYDGrP9Wl964IeFvtz9JFluIvlEvcdoXDOdxggbDxGwTXcxFRi/LdirKgZUBm7SUdJG69IwSUzAMWgOAq/4hyrZVaJISSNWHFVbEoCFEhyBrCtXS9L+so9oTy8wGqxbQDD350WTjNESVFEB5hdKzUGcV5QtYxVWR2Ssl4Mg9qI9u6FCBInJRXgfEEgtS9Cgrg7kKouq4mdcDNBnEHQvWFTdgdgsqP+MiluVeBM13ahx09AYSWi50gsF+I6vn7BmCEoHR3NBzkpIOw4+XdVBBGQUioblaZHbGlodtB+N/jxqwLX/x/NARfD8ADxTOCKIcwE4Lw0OIbguMYcGTlymEpHYLXIKx8zQEqIfS2lGJPaADFEBR/PMH79ErqtpnZmTBlvM4wgihPWDEEhXn1LISj50crNgfCp+dWHYQRCfb2zgfnBZmKGAyi914anK9Coi4LOMhoAn3uVtn+AGnLKxPUZnCuAAAAAElFTkSuQmCC';
    const img = Buffer.from(imgdata, 'base64');

    var favicon = (method, tokens, query, body) => {
        console.log('serving favicon...');
        const headers = {
            'Content-Type': 'image/png',
            'Content-Length': img.length
        };
        let result = img;

        return {
            headers,
            result
        };
    };

    var require$$0 = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n    <meta charset=\"UTF-8\">\n    <meta http-equiv=\"X-UA-Compatible\" content=\"IE=edge\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n    <title>SUPS Admin Panel</title>\n    <style>\n        * {\n            padding: 0;\n            margin: 0;\n        }\n\n        body {\n            padding: 32px;\n            font-size: 16px;\n        }\n\n        .layout::after {\n            content: '';\n            clear: both;\n            display: table;\n        }\n\n        .col {\n            display: block;\n            float: left;\n        }\n\n        p {\n            padding: 8px 16px;\n        }\n\n        table {\n            border-collapse: collapse;\n        }\n\n        caption {\n            font-size: 120%;\n            text-align: left;\n            padding: 4px 8px;\n            font-weight: bold;\n            background-color: #ddd;\n        }\n\n        table, tr, th, td {\n            border: 1px solid #ddd;\n        }\n\n        th, td {\n            padding: 4px 8px;\n        }\n\n        ul {\n            list-style: none;\n        }\n\n        .collection-list a {\n            display: block;\n            width: 120px;\n            padding: 4px 8px;\n            text-decoration: none;\n            color: black;\n            background-color: #ccc;\n        }\n        .collection-list a:hover {\n            background-color: #ddd;\n        }\n        .collection-list a:visited {\n            color: black;\n        }\n    </style>\n    <script type=\"module\">\nimport { html, render } from 'https://unpkg.com/lit-html@1.3.0?module';\nimport { until } from 'https://unpkg.com/lit-html@1.3.0/directives/until?module';\n\nconst api = {\n    async get(url) {\n        return json(url);\n    },\n    async post(url, body) {\n        return json(url, {\n            method: 'POST',\n            headers: { 'Content-Type': 'application/json' },\n            body: JSON.stringify(body)\n        });\n    }\n};\n\nasync function json(url, options) {\n    return await (await fetch('/' + url, options)).json();\n}\n\nasync function getCollections() {\n    return api.get('data');\n}\n\nasync function getRecords(collection) {\n    return api.get('data/' + collection);\n}\n\nasync function getThrottling() {\n    return api.get('util/throttle');\n}\n\nasync function setThrottling(throttle) {\n    return api.post('util', { throttle });\n}\n\nasync function collectionList(onSelect) {\n    const collections = await getCollections();\n\n    return html`\n    <ul class=\"collection-list\">\n        ${collections.map(collectionLi)}\n    </ul>`;\n\n    function collectionLi(name) {\n        return html`<li><a href=\"javascript:void(0)\" @click=${(ev) => onSelect(ev, name)}>${name}</a></li>`;\n    }\n}\n\nasync function recordTable(collectionName) {\n    const records = await getRecords(collectionName);\n    const layout = getLayout(records);\n\n    return html`\n    <table>\n        <caption>${collectionName}</caption>\n        <thead>\n            <tr>${layout.map(f => html`<th>${f}</th>`)}</tr>\n        </thead>\n        <tbody>\n            ${records.map(r => recordRow(r, layout))}\n        </tbody>\n    </table>`;\n}\n\nfunction getLayout(records) {\n    const result = new Set(['_id']);\n    records.forEach(r => Object.keys(r).forEach(k => result.add(k)));\n\n    return [...result.keys()];\n}\n\nfunction recordRow(record, layout) {\n    return html`\n    <tr>\n        ${layout.map(f => html`<td>${JSON.stringify(record[f]) || html`<span>(missing)</span>`}</td>`)}\n    </tr>`;\n}\n\nasync function throttlePanel(display) {\n    const active = await getThrottling();\n\n    return html`\n    <p>\n        Request throttling: </span>${active}</span>\n        <button @click=${(ev) => set(ev, true)}>Enable</button>\n        <button @click=${(ev) => set(ev, false)}>Disable</button>\n    </p>`;\n\n    async function set(ev, state) {\n        ev.target.disabled = true;\n        await setThrottling(state);\n        display();\n    }\n}\n\n//import page from '//unpkg.com/page/page.mjs';\n\n\nfunction start() {\n    const main = document.querySelector('main');\n    editor(main);\n}\n\nasync function editor(main) {\n    let list = html`<div class=\"col\">Loading&hellip;</div>`;\n    let viewer = html`<div class=\"col\">\n    <p>Select collection to view records</p>\n</div>`;\n    display();\n\n    list = html`<div class=\"col\">${await collectionList(onSelect)}</div>`;\n    display();\n\n    async function display() {\n        render(html`\n        <section class=\"layout\">\n            ${until(throttlePanel(display), html`<p>Loading</p>`)}\n        </section>\n        <section class=\"layout\">\n            ${list}\n            ${viewer}\n        </section>`, main);\n    }\n\n    async function onSelect(ev, name) {\n        ev.preventDefault();\n        viewer = html`<div class=\"col\">${await recordTable(name)}</div>`;\n        display();\n    }\n}\n\nstart();\n\n</script>\n</head>\n<body>\n    <main>\n        Loading&hellip;\n    </main>\n</body>\n</html>";

    const mode = process.argv[2] == '-dev' ? 'dev' : 'prod';

    const files = {
        index: mode == 'prod' ? require$$0 : fs__default['default'].readFileSync('./client/index.html', 'utf-8')
    };

    var admin = (method, tokens, query, body) => {
        const headers = {
            'Content-Type': 'text/html'
        };
        let result = '';

        const resource = tokens.join('/');
        if (resource && resource.split('.').pop() == 'js') {
            headers['Content-Type'] = 'application/javascript';

            files[resource] = files[resource] || fs__default['default'].readFileSync('./client/' + resource, 'utf-8');
            result = files[resource];
        } else {
            result = files.index;
        }

        return {
            headers,
            result
        };
    };

    /*
     * This service requires util plugin
     */

    const utilService = new Service_1();

    utilService.post('*', onRequest);
    utilService.get(':service', getStatus);

    function getStatus(context, tokens, query, body) {
        return context.util[context.params.service];
    }

    function onRequest(context, tokens, query, body) {
        Object.entries(body).forEach(([k, v]) => {
            console.log(`${k} ${v ? 'enabled' : 'disabled'}`);
            context.util[k] = v;
        });
        return '';
    }

    var util$1 = utilService.parseRequest;

    var services = {
        jsonstore,
        users,
        data: data$1,
        favicon,
        admin,
        util: util$1
    };

    const { uuid: uuid$2 } = util;


    function initPlugin(settings) {
        const storage = createInstance(settings.seedData);
        const protectedStorage = createInstance(settings.protectedData);

        return function decoreateContext(context, request) {
            context.storage = storage;
            context.protectedStorage = protectedStorage;
        };
    }


    /**
     * Create storage instance and populate with seed data
     * @param {Object=} seedData Associative array with data. Each property is an object with properties in format {key: value}
     */
    function createInstance(seedData = {}) {
        const collections = new Map();

        // Initialize seed data from file    
        for (let collectionName in seedData) {
            if (seedData.hasOwnProperty(collectionName)) {
                const collection = new Map();
                for (let recordId in seedData[collectionName]) {
                    if (seedData.hasOwnProperty(collectionName)) {
                        collection.set(recordId, seedData[collectionName][recordId]);
                    }
                }
                collections.set(collectionName, collection);
            }
        }


        // Manipulation

        /**
         * Get entry by ID or list of all entries from collection or list of all collections
         * @param {string=} collection Name of collection to access. Throws error if not found. If omitted, returns list of all collections.
         * @param {number|string=} id ID of requested entry. Throws error if not found. If omitted, returns of list all entries in collection.
         * @return {Object} Matching entry.
         */
        function get(collection, id) {
            if (!collection) {
                return [...collections.keys()];
            }
            if (!collections.has(collection)) {
                throw new ReferenceError('Collection does not exist: ' + collection);
            }
            const targetCollection = collections.get(collection);
            if (!id) {
                const entries = [...targetCollection.entries()];
                let result = entries.map(([k, v]) => {
                    return Object.assign(deepCopy(v), { _id: k });
                });
                return result;
            }
            if (!targetCollection.has(id)) {
                throw new ReferenceError('Entry does not exist: ' + id);
            }
            const entry = targetCollection.get(id);
            return Object.assign(deepCopy(entry), { _id: id });
        }

        /**
         * Add new entry to collection. ID will be auto-generated
         * @param {string} collection Name of collection to access. If the collection does not exist, it will be created.
         * @param {Object} data Value to store.
         * @return {Object} Original value with resulting ID under _id property.
         */
        function add(collection, data) {
            const record = assignClean({ _ownerId: data._ownerId }, data);

            let targetCollection = collections.get(collection);
            if (!targetCollection) {
                targetCollection = new Map();
                collections.set(collection, targetCollection);
            }
            let id = uuid$2();
            // Make sure new ID does not match existing value
            while (targetCollection.has(id)) {
                id = uuid$2();
            }

            record._createdOn = Date.now();
            targetCollection.set(id, record);
            return Object.assign(deepCopy(record), { _id: id });
        }

        /**
         * Replace entry by ID
         * @param {string} collection Name of collection to access. Throws error if not found.
         * @param {number|string} id ID of entry to update. Throws error if not found.
         * @param {Object} data Value to store. Record will be replaced!
         * @return {Object} Updated entry.
         */
        function set(collection, id, data) {
            if (!collections.has(collection)) {
                throw new ReferenceError('Collection does not exist: ' + collection);
            }
            const targetCollection = collections.get(collection);
            if (!targetCollection.has(id)) {
                throw new ReferenceError('Entry does not exist: ' + id);
            }

            const existing = targetCollection.get(id);
            const record = assignSystemProps(deepCopy(data), existing);
            record._updatedOn = Date.now();
            targetCollection.set(id, record);
            return Object.assign(deepCopy(record), { _id: id });
        }

        /**
         * Modify entry by ID
         * @param {string} collection Name of collection to access. Throws error if not found.
         * @param {number|string} id ID of entry to update. Throws error if not found.
         * @param {Object} data Value to store. Shallow merge will be performed!
         * @return {Object} Updated entry.
         */
        function merge(collection, id, data) {
            if (!collections.has(collection)) {
                throw new ReferenceError('Collection does not exist: ' + collection);
            }
            const targetCollection = collections.get(collection);
            if (!targetCollection.has(id)) {
                throw new ReferenceError('Entry does not exist: ' + id);
            }

            const existing = deepCopy(targetCollection.get(id));
            const record = assignClean(existing, data);
            record._updatedOn = Date.now();
            targetCollection.set(id, record);
            return Object.assign(deepCopy(record), { _id: id });
        }

        /**
         * Delete entry by ID
         * @param {string} collection Name of collection to access. Throws error if not found.
         * @param {number|string} id ID of entry to update. Throws error if not found.
         * @return {{_deletedOn: number}} Server time of deletion.
         */
        function del(collection, id) {
            if (!collections.has(collection)) {
                throw new ReferenceError('Collection does not exist: ' + collection);
            }
            const targetCollection = collections.get(collection);
            if (!targetCollection.has(id)) {
                throw new ReferenceError('Entry does not exist: ' + id);
            }
            targetCollection.delete(id);

            return { _deletedOn: Date.now() };
        }

        /**
         * Search in collection by query object
         * @param {string} collection Name of collection to access. Throws error if not found.
         * @param {Object} query Query object. Format {prop: value}.
         * @return {Object[]} Array of matching entries.
         */
        function query(collection, query) {
            if (!collections.has(collection)) {
                throw new ReferenceError('Collection does not exist: ' + collection);
            }
            const targetCollection = collections.get(collection);
            const result = [];
            // Iterate entries of target collection and compare each property with the given query
            for (let [key, entry] of [...targetCollection.entries()]) {
                let match = true;
                for (let prop in entry) {
                    if (query.hasOwnProperty(prop)) {
                        const targetValue = query[prop];
                        // Perform lowercase search, if value is string
                        if (typeof targetValue === 'string' && typeof entry[prop] === 'string') {
                            if (targetValue.toLocaleLowerCase() !== entry[prop].toLocaleLowerCase()) {
                                match = false;
                                break;
                            }
                        } else if (targetValue != entry[prop]) {
                            match = false;
                            break;
                        }
                    }
                }

                if (match) {
                    result.push(Object.assign(deepCopy(entry), { _id: key }));
                }
            }

            return result;
        }

        return { get, add, set, merge, delete: del, query };
    }


    function assignSystemProps(target, entry, ...rest) {
        const whitelist = [
            '_id',
            '_createdOn',
            '_updatedOn',
            '_ownerId'
        ];
        for (let prop of whitelist) {
            if (entry.hasOwnProperty(prop)) {
                target[prop] = deepCopy(entry[prop]);
            }
        }
        if (rest.length > 0) {
            Object.assign(target, ...rest);
        }

        return target;
    }


    function assignClean(target, entry, ...rest) {
        const blacklist = [
            '_id',
            '_createdOn',
            '_updatedOn',
            '_ownerId'
        ];
        for (let key in entry) {
            if (blacklist.includes(key) == false) {
                target[key] = deepCopy(entry[key]);
            }
        }
        if (rest.length > 0) {
            Object.assign(target, ...rest);
        }

        return target;
    }

    function deepCopy(value) {
        if (Array.isArray(value)) {
            return value.map(deepCopy);
        } else if (typeof value == 'object') {
            return [...Object.entries(value)].reduce((p, [k, v]) => Object.assign(p, { [k]: deepCopy(v) }), {});
        } else {
            return value;
        }
    }

    var storage = initPlugin;

    const { ConflictError: ConflictError$1, CredentialError: CredentialError$1, RequestError: RequestError$2 } = errors;

    function initPlugin$1(settings) {
        const identity = settings.identity;

        return function decorateContext(context, request) {
            context.auth = {
                register,
                login,
                logout
            };

            const userToken = request.headers['x-authorization'];
            if (userToken !== undefined) {
                let user;
                const session = findSessionByToken(userToken);
                if (session !== undefined) {
                    const userData = context.protectedStorage.get('users', session.userId);
                    if (userData !== undefined) {
                        console.log('Authorized as ' + userData[identity]);
                        user = userData;
                    }
                }
                if (user !== undefined) {
                    context.user = user;
                } else {
                    throw new CredentialError$1('Invalid access token');
                }
            }

            function register(body) {
                if (body.hasOwnProperty(identity) === false ||
                    body.hasOwnProperty('password') === false ||
                    body[identity].length == 0 ||
                    body.password.length == 0) {
                    throw new RequestError$2('Missing fields');
                } else if (context.protectedStorage.query('users', { [identity]: body[identity] }).length !== 0) {
                    throw new ConflictError$1(`A user with the same ${identity} already exists`);
                } else {
                    const newUser = Object.assign({}, body, {
                        [identity]: body[identity],
                        hashedPassword: hash(body.password),
                        role: "user",
                    });
                    const result = context.protectedStorage.add('users', newUser);
                    delete result.hashedPassword;

                    const session = saveSession(result._id);
                    result.accessToken = session.accessToken;

                    return result;
                }
            }

            function login(body) {
                const targetUser = context.protectedStorage.query('users', { [identity]: body[identity] });
                if (targetUser.length == 1) {
                    if (hash(body.password) === targetUser[0].hashedPassword) {
                        const result = targetUser[0];
                        delete result.hashedPassword;

                        const session = saveSession(result._id);
                        result.accessToken = session.accessToken;

                        return result;
                    } else {
                        throw new CredentialError$1('Login or password don\'t match');
                    }
                } else {
                    throw new CredentialError$1('Login or password don\'t match');
                }
            }

            function logout() {
                if (context.user !== undefined) {
                    const session = findSessionByUserId(context.user._id);
                    if (session !== undefined) {
                        context.protectedStorage.delete('sessions', session._id);
                    }
                } else {
                    throw new CredentialError$1('User session does not exist');
                }
            }

            function saveSession(userId) {
                let session = context.protectedStorage.add('sessions', { userId });
                const accessToken = hash(session._id);
                session = context.protectedStorage.set('sessions', session._id, Object.assign({ accessToken }, session));
                return session;
            }

            function findSessionByToken(userToken) {
                return context.protectedStorage.query('sessions', { accessToken: userToken })[0];
            }

            function findSessionByUserId(userId) {
                return context.protectedStorage.query('sessions', { userId })[0];
            }
        };
    }


    const secret = 'This is not a production server';

    function hash(string) {
        const hash = crypto__default['default'].createHmac('sha256', secret);
        hash.update(string);
        return hash.digest('hex');
    }

    var auth = initPlugin$1;

    function initPlugin$2(settings) {
        const util = {
            throttle: false
        };

        return function decoreateContext(context, request) {
            context.util = util;
        };
    }

    var util$2 = initPlugin$2;

    /*
     * This plugin requires auth and storage plugins
     */

    const { RequestError: RequestError$3, ConflictError: ConflictError$2, CredentialError: CredentialError$2, AuthorizationError: AuthorizationError$2 } = errors;

    function initPlugin$3(settings) {
        const actions = {
            'GET': '.read',
            'POST': '.create',
            'PUT': '.update',
            'PATCH': '.update',
            'DELETE': '.delete'
        };
        const rules = Object.assign({
            '*': {
                '.create': ['User'],
                '.update': ['Owner'],
                '.delete': ['Owner']
            }
        }, settings.rules);

        return function decorateContext(context, request) {
            // special rules (evaluated at run-time)
            const get = (collectionName, id) => {
                return context.storage.get(collectionName, id);
            };
            const isOwner = (user, object) => {
                return user._id == object._ownerId;
            };
            context.rules = {
                get,
                isOwner
            };
            const isAdmin = request.headers.hasOwnProperty('x-admin');

            context.canAccess = canAccess;

            function canAccess(data, newData) {
                const user = context.user;
                const action = actions[request.method];
                let { rule, propRules } = getRule(action, context.params.collection, data);

                if (Array.isArray(rule)) {
                    rule = checkRoles(rule, data);
                } else if (typeof rule == 'string') {
                    rule = !!(eval(rule));
                }
                if (!rule && !isAdmin) {
                    throw new CredentialError$2();
                }
                propRules.map(r => applyPropRule(action, r, user, data, newData));
            }

            function applyPropRule(action, [prop, rule], user, data, newData) {
                // NOTE: user needs to be in scope for eval to work on certain rules
                if (typeof rule == 'string') {
                    rule = !!eval(rule);
                }

                if (rule == false) {
                    if (action == '.create' || action == '.update') {
                        delete newData[prop];
                    } else if (action == '.read') {
                        delete data[prop];
                    }
                }
            }

            function checkRoles(roles, data, newData) {
                if (roles.includes('Guest')) {
                    return true;
                } else if (!context.user && !isAdmin) {
                    throw new AuthorizationError$2();
                } else if (roles.includes('User')) {
                    return true;
                } else if (context.user && roles.includes('Owner')) {
                    return context.user._id == data._ownerId;
                } else {
                    return false;
                }
            }
        };



        function getRule(action, collection, data = {}) {
            let currentRule = ruleOrDefault(true, rules['*'][action]);
            let propRules = [];

            // Top-level rules for the collection
            const collectionRules = rules[collection];
            if (collectionRules !== undefined) {
                // Top-level rule for the specific action for the collection
                currentRule = ruleOrDefault(currentRule, collectionRules[action]);

                // Prop rules
                const allPropRules = collectionRules['*'];
                if (allPropRules !== undefined) {
                    propRules = ruleOrDefault(propRules, getPropRule(allPropRules, action));
                }

                // Rules by record id 
                const recordRules = collectionRules[data._id];
                if (recordRules !== undefined) {
                    currentRule = ruleOrDefault(currentRule, recordRules[action]);
                    propRules = ruleOrDefault(propRules, getPropRule(recordRules, action));
                }
            }

            return {
                rule: currentRule,
                propRules
            };
        }

        function ruleOrDefault(current, rule) {
            return (rule === undefined || rule.length === 0) ? current : rule;
        }

        function getPropRule(record, action) {
            const props = Object
                .entries(record)
                .filter(([k]) => k[0] != '.')
                .filter(([k, v]) => v.hasOwnProperty(action))
                .map(([k, v]) => [k, v[action]]);

            return props;
        }
    }

    var rules = initPlugin$3;

    var identity = "email";
    var protectedData = {
        users: {
            "1": {
                email: "admin@portal-silistra.eu",
                username: "Portal",
                hashedPassword: "83313014ed3e2391aa1332615d2f053cf5c1bfe05ca1cbcb5582443822df6eb1",
                role: "admin",
            },
            "2": {
                email: "reporter@portal-silistra.eu",
                username: "Reporter",
                hashedPassword: "83313014ed3e2391aa1332615d2f053cf5c1bfe05ca1cbcb5582443822df6eb1",
                role: "reporter",
            },
            "35c62d76-8152-4626-8712-eeb96381bea8": {
                email: "peter@abv.bg",
                username: "Peter",
                hashedPassword: "83313014ed3e2391aa1332615d2f053cf5c1bfe05ca1cbcb5582443822df6eb1",
                role: "user"
            },
            "847ec027-f659-4086-8032-5173e2f9c93a": {
                email: "george@abv.bg",
                username: "George",
                hashedPassword: "83313014ed3e2391aa1332615d2f053cf5c1bfe05ca1cbcb5582443822df6eb1",
                role: "user"
            },
            "60f0cf0b-34b0-4abd-9769-8c42f830dffc": {
                email: "admin@abv.bg",
                username: "Admin",
                hashedPassword: "fac7060c3e17e6f151f247eacb2cd5ae80b8c36aedb8764e18a41bbdc16aa302",
                role: "admin"
            }
        },
        sessions: {
        }
    };
    var seedData = {
        news: {
            "12274": {
                "title": "Сабанов: Грижа за малките и големи земеделски производители, подкрепа за бизнеса и инвестициите",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/be8d86acd632c3b7214ee410b76d43e6.webp",
                "article": "На 21-ти октомври Александър Сабанов и кандидатите за общински съветници от МК „Алтернативата на гражданите“ организираха импровизирана приемна по време на съботния пазар в Силистра. На централния градски пазар Сабанов разговаря с местни фермери, които му споделиха проблемите си. Той разговаря и с граждани, които бяха решили да пазаруват в почивния си ден. Сабанов беше гост на 10-ят юбилеен празник \"Земята и хората\", който се проведе в село Бабук. Той подари картина на Ненко Лесев, председател на ЗК\"Мотор-93\". Следобед Сабанов изгледа победата на 13-годишните баскетболисти на Доростол над Светкавица, а по-късно наблюдава футболния двубой между отборите от с.Калипетрово и гр. Алфатар. В село Смилец пред препълнената зала на местното читалище Сабанов и Денислав Бату, кандидат за общински съветник от „Алтернативата на гражданите“ призоваха всички да гласуват на 29 октомври за да подкрепят промяната в Община Силистра. В село Пр. Иширково Сабанов и кандидатите за общински съветници от „Алтернативата на гражданите“ и БСП, заедно с кандидата за кмет на селото Стойчо Нечев се срещнаха с жителите на голямото добруджанско село и разговаряха за нерешените проблеми през последните 12 години и привличане на истински инвестиции, за да могат младите хора да се завърнат и да отглеждат децата си тук. ",
                "_ownerId": "1",
                "category": "23",
                "region": "8",
                "_createdOn": 1697966708000,
                "_updatedOn": 1697966737000
            },
            "12275": {
                "title": "Община Главиница закупи нов комбиниран багер, който ще бъде предаден на ОП „Общински имоти и комунални дейности“",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/93a8b449acbbcaa962f726a475b75c26.webp",
                "article": "Община Главиница закупи нов комбиниран багер, който ще бъде предаден на ОП „Общински имоти и комунални дейности“ за стопанисване и ползване, съобщиха вчера от администрацията. Целта на местната власт в община Главиница е да продължи усилията за повишаване качеството на комуналните услуги във всички населени места на територията на общината. ",
                "_ownerId": "1",
                "category": "10",
                "region": "2",
                "_createdOn": 1697967037000,
                "_updatedOn": 1697967037000
            },
            "12276": {
                "title": "След серия от обжалвания, стартира ремонта на НЧ \"Стефан Караджа - 1963г.\", село Любен",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/33d72dd693e90090c12adf0c70e0ab3b.webp",
                "article": "След близо четири месечно забавяне поради обжалване на решението за избор на изпълнител към обществената поръчка с предмет: „Основен ремонт на обекти от капиталовата програма на Община Ситово по обособени позиции“ се даде старт на ремонтните дейности по сградата на НЧ \"Стефан Караджа - 1963г.\", с.Любен, съобщават във Facebook от администрацията. Проекта предвижда изпълнение в два етапа. Първия етап се състои в основен ремонт на покрива - подмяна на дървени елементи и покриване с нови керемиди, както и саниране на сградата. Предвидената изолация е с дебелина от 10 см. Втори етап от изпълнението на проекта предвижда - изграждане на рампа за осигуряване на достъпна среда и внедряване на мерки за енергийна ефективност. До броени дни ще стартират и ремонтните дейности по сградата на НЧ \"Христо Смирненски - 1940 г. \", с. Ситово. Обектите са част от капиталовата програма на община Ситово.",
                "_ownerId": "1",
                "category": "3",
                "region": "4",
                "_createdOn": 1697967208000,
                "_updatedOn": 1697967208000
            },
            "12277": {
                "title": "Една история за корупция в постановката \"Под масата\", тази вечер на сцената в Силистра",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/3813366ead33df6e052ec0042da940d4.webp",
                "article": "Текст на съвременния френски драматург Жан–Пиер Мартинез представят на сцената на Драматично-куклен театър в Силистра. Режисьор на постановката е Владимир Петков, който се познава с автора, макар и не лично, от 3-4 години, когато поставя първата му пиеса в Сатиричния театър в столицата. Покрай нея се сприятеляват от разстояние и така идва поредният текст, който се превръща в спектакъл, озаглавен \"Под масата\". Сюжетът ѝ разказва как изпълнителен директор на голяма строителна компания кани на вечеря в дома си един министър. Целта му е да го убеди да приеме офертата му за строителство на нова магистрала и да подпише солиден договор с неговата компания. За да подсили аргументите си, предприемачът е осигурил момиче на повикване, което ще изиграе картата на прелъстяването. Момичето, което идва, замества своя приятелка, като си мисли, че ще сервира закуски, докато всъщност самата тя е включена в \"менюто\". Новата комедия на Драматичния театър в Търговище е с участието на гостуващия актьор Васил Драганов, както и на артистите от местната трупа Божидар Попчев и Любомира Стефанова. Постановката на \"Под масата\" от Жан–Пиер Мартинез е тази вечер от 18:00 часа в сградата на Драматично-куклен театър Силистра и е с ВХОД СВОБОДЕН. Тя е подарък от Александър Сабанов, независим кандидат за кмет на Община Силистра.",
                "_ownerId": "1",
                "category": "5",
                "region": "8",
                "_createdOn": 1698051420000,
                "_updatedOn": 1698051420000
            },
            "12278": {
                "title": "Ивелин Статев и кандидатите за общински съветници на ПП ГЕРБ се срещнаха с жителите на село Сребърна",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/d9707cc6a124a1b8ee1cf4b0f21beeca.webp",
                "article": "В село Сребърна кандидатът за кмет на селото г-н Георги Иванов направи отчет за дейността си през последните 4 години. Той посочи, че направеното се вижда от всички жители и гости на селото: нов покрив на читалището, ремонт на здравната служба, обновяване на сградата на Природонаучен музей Сребърна, който е бил работещ до 1985г. Кметът предложи на своите съселяни след пълен ремонт да бъде оборудвана сградата с посуда, носии, инструменти, вещи от бита, от старите занаяти и поминък и да се превърне в етнографски музей. Монтирани са 4 камери за видеонаблюдение и за пресичане на домовите кражби. Обновено е къмпинг пространството и се работи по подновяване на еко пътеките около езерото. В селото активно се обслужват самотно живеещи възрастни хора, по асистентска подкрепа, програмата \"Грижа в дома\" и се доставя топъл обяд за социално уязвими хора. Ивелин Статев кандидат за кмет на община Силистра посочи, че село Сребърна е населено място, към което ще бъдат насочени много инициативи и проекти на местната власт, защото Сребърна е обект на световната карта. Туристическият продукт, с който ще се представи Биосферен парк Сребърна трябва да обнови и селото. На срещата присъстваха кандидатът за кмет на село Айдемир инж. Денчо Георгиев и кандидатите за общински съветници от ПП ГЕРБ: д-р Мария Димитрова, Мария Недялкова, Денка Михайлова, Яна Райнова, Мирослава Червенкова, Стоян Узунов, Денислав Димитров, Ивелин Неделчев, Валентин Перчемлиев, Тодор Велинов, д-р Стоян Киров, Георги Спасов, Десислава Георгиева, Димитър Джамбазов. ",
                "_ownerId": "1",
                "category": "21",
                "region": "8",
                "_createdOn": 1698051820000,
                "_updatedOn": 1698054396000
            },
            "12279": {
                "title": "Деца намериха пари, предадоха ги в полицията",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/90d1aeac3ea7bbde043bd74a48bfda2c.webp",
                "article": "Седем шестокласника от СУ „Н.Й.Вапцаров“ в Силистра предадоха днес в полицията намерена парична сума. Кристиан Искренов, Денислав Александров, Виктор Николаев, Никол Тобошарова, Йоанна Петрова, Александър Александров и Стефани Василева се натъкнали на банкнотите в голямото междучасие и без колебание ги предали в полицията. С поздравителен адрес директорът на ОДМВР-Силистра старши комисар Мартин Недялков похвали децата за достойната постъпка. В него той отбелязва проявените от тях честност и благородство и подчертава, че поведението им е пример за подражание не само за техните връстници, но и за цялото общество. Предадената от децата сума е на съхранение в Районното управление и ще бъде върната на собственика след описание на банкнотите и други детайли.",
                "_ownerId": "1",
                "category": "11",
                "region": "4",
                "_createdOn": 1698064568000,
                "_updatedOn": 1698064568000
            },
            "12280": {
                "title": "Ивелин Статев, кандидат за кмет на община Силистра: Бизнесът е гарант за развитието на града ни",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/f381ea085102ae68014e93318aed436a.webp",
                "article": "\"Бизнесът е гарант за развитието на града ни\". това каза Ивелин Статев, който е кандидат за кмет на община Силистра, издигнат от ПП ГЕРБ. По време на три предизборни срещи с работодателите на фирмите: \"Поларис 8\"ООД, с управител инж. Владимир Рашков; \" Екотех-синхрон\"- с управител инж. Димитър Димитров; \"Фазерлес\" АД, с управител инж. Милко Кесаровски, кандидатът за кмет на община Силистра г-н Ивелин Статев и кандидатите за общински съветници от ПП ГЕРБ разговаряха с хората заети в производството. Работещите активно се интересуваха от програмата за управление на Община Силистра. На срещата присъстваха и кандидатите за общински съветници от ПП ГЕРБ: д-р Мария Димитрова, Денка Михайлова, Яна Райнова, Мирослава Червенкова, Тодор Велинов, Стоян Узунов,Мирослав Димитров, Георги Спасов и кандидатът за кмет на село Айдемир инж Денчо Георгиев. ",
                "_ownerId": "1",
                "category": "20",
                "region": "5",
                "_createdOn": 1698137929000,
                "_updatedOn": 1698137980000
            },
            "12281": {
                "title": "Александър Сабанов посети силистренски предприятия, подари спектакъл и покани на концерт",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/c363090934dffc3fbb1bc5301b32408d.webp",
                "article": "На 23 октомври 2023 г. независимият кандидат за кмет на Община Силистра Александър Сабанов посети три от водещите предприятия в града: Еликом Електроник, Тукай България и Трудово-производствена кооперация „ДОБРУДЖАНКА“. Във всяко предприятие Сабанов се срещна със служители и обсъди визията си за бъдещето на Силистра. Той подчерта ангажимента си за създаване на чист, проспериращ град, в който младите хора искат да се връщат и да отглеждат децата си. Вечерта Сабанов присъства на представлението на \"Под масата\" от Жан-Пиер Мартинез в Драматичния театър в Силистра. Спектакълът беше подарък от г-н Сабанов за всички силистренци, а той самият беше посрещнат с горещи аплодисменти от публиката. След представлението Сабанов поздрави всички присъстващи и ги покани на 25 октомври, сряда, на концерт на Тоника СВ на площад „Свобода“ в центъра на Силистра. ",
                "_ownerId": "1",
                "category": "19",
                "region": "3",
                "_createdOn": 1698138158000,
                "_updatedOn": 1698138158000
            },
            "12282": {
                "title": "Ивелин Статев и кандидатите за общински съветници на ПП ГЕРБ се срещнаха с жителите на село Проф. Иширково",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/5623ba49bb2ec16e3e346e544b403708.webp",
                "article": "На предизборна среща в село Професор Иширково, Венцислав Маринов-кандидат за кмет на селото направи отчет и обръщение към жителите на Иширково. Г-н Ивелин Статев, кандидат за кмет на община Силистра посочи приоритетите, заложени в Програмата за управление на Община Силистра. Срещата води д-р Мария Димитрова. Тя представи кандидатите за общински съветници от листата на ГЕРБ. Д-р Мария Димитрова, Мария Недялкова, Мирослава Червенкова, Яна Райнова, Десислава Георгиева, Валентин Перчемлиев, Денислав Димитров, Ивелин Неделчев, Тодор Велинов, Ралица Михайлова, Константин Стоилов, кандидат за кмет на село Професор Иширково Венцислав Маринов. ",
                "_ownerId": "1",
                "category": "20",
                "region": "2",
                "_createdOn": 1698138827000,
                "_updatedOn": 1698138827000
            },
            "12283": {
                "title": "Легендарната група \"Тоника СВ\" ще пеят утре в Силистра",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/3c8026ca308a836feea2b649a23c39b9.webp",
                "article": "Легендарната група \"Тоника СВ\" ще представи в Силистра своята нова програма включваща златните им хитове и няколко съвсем нови песни на маестро Стефан Диомов. Новата им продукция идва след дълга пауза и се очаква с огромен интерес от публиката в крайдунавския град. Концерта ще бъде на 25 октомври, сряда, от 18.00 часа на площад \"Свобода\", в центъра на Силистра. В състава на групата се включва и Емил Василев - дългогодишен солист на \"Тоника\" СВ и участник в първите им плочи, албуми и записи. Подарете си два часа незабравими емоции и настроение с най-легендарната вокална група в България. Концертът е подарък от Александър Сабанов, независим кандидат за кмет на Община Силистра. ",
                "_ownerId": "1",
                "category": "20",
                "region": "7",
                "_createdOn": 1698139200000,
                "_updatedOn": 1698139260000
            },
            "12284": {
                "title": "Петко Добрев представи програма как да превърне Силистра в благоденстващ град",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/341f79ba3344aaa7cccba0a5b6540727.webp",
                "article": "„Като кандидат за кмет от „Възраждане“ аз всеки ден коментирам с граждани управленската ми програма за развитието на града, отговарям и на всякакви въпроси, които хората задават в социалните мрежи. Смятам, че водим открита и честна кампания. За нас целта, която сме си поставили за една благоденстваща Силистра не е просто популистки лозунг, който се използва по време на избори, а реалност, която ще реализираме, ако гражданите ни дадат шанс. Всеки ден обсъждаме с хората, които живеят в общината или са емигрирали от нея, как може заедно да реализираме тази основна цел - благоденствието трябва да е за всички.“, каза Петко Добрев в телевизионно интервю. Той е разработил проект, в който ясно е описал приоритети си, как точно ще бъдат изпълнени и откъде ще се реализират финансово. „Чрез Гаранционен фонд ще помогнем на тези, които искат да развиват бизнес, а с привеждането в състояние на достъпност на публичната инфраструктура ще помогнем на хората с увреждания. С въвеждането на зелен стандарт за всяко населено място ще определим зелените площи и как трябва да изглеждат те, а с правилното развитие на общинското дружество Синева ще произведем необходимата ни зеленина и облагородим отредените площи. Достъпност и качество – това пък са критериите ни за здравеопазване, образование, спорт, култура и почивка. В общинския бюджет всяка година ще се предвиждат средства, които да се използват за закупуване на медицинска апаратура и подобряване състоянието на общинските болнични заведения.“, коментира Петко Добрев, кандидат за кмет от „Възраждане“. В плановете е заложил и реализиране на стратегията за образование през целия живот. „Ще направим спортуването за здраве привлекателно за хората от всички възрасти и ще увеличим възможностите за упражняване на различни видове спорт за хората, които живеят в нашата община.“, допълни той. Според него общинската администрация е абсолютно неспособна да се справи с проблема, че всяка година Силистра страда от насекомите и комарите. „Решаването му не изисква нито особени инвестиции, нито тежки процедури. Необходима е единствено загриженост и отговорно отношение към проблема от страна на местната администрация. Ние ще наложим практиката за ефективна борба с комари, гризачи и други вредители.“, каза още Петко Добрев в ефир. Той смята, че провеждането на шумни събития на другия бряг на Дунав, които смущават спокойствието на силистренци, също следва да са във фокуса на вниманието на местната власт. Кметът на Силистра е длъжен да прояви загриженост и да предприеме всички възможни действия, за недопускане провеждането на събития, които притесняват и безпокоят хората след определен часови диапазон. „Пътят към благоденстваща Силистра минава и през максималното използване на географското положение на града и река Дунав, за които имаме поредица от предвидени инициативи.“, каза в заключение Петко Добрев. „Възраждане“ е с N42 в бюлетината! КУПУВАНЕТО И ПРАДАВАНЕТО НА ГЛАСОВЕ Е ПРЕСТЪПЛЕНИЕ!",
                "_ownerId": "1",
                "category": "23",
                "region": "7",
                "_createdOn": 1698152911000,
                "_updatedOn": 1698152911000
            },
            "12285": {
                "title": "Независимият кандидат за кмет на община Силистра, Александър Сабанов посети село Казимир",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/e23dea83e3e7a3f81e43dafbb6b1b54b.webp",
                "article": "\"Днес, с жителите на с. Казимир обсъдихме програмата за управление на община Силистра\", съобщава в личния си Фейсбук профил независимият кандидат за кмет Александър Сабанов. \"Жителите на селото се оплакаха от лошите улици, липсата на млади хора и работа за тях. Всички се съгласиха, че промяна е нужна - сега и веднага. Гласувайте за кмет на община с номер 70 в бюлетината за мен Александър Сабанов! Гласувайте за общински съветници с номер 68 в бюлетината за “Алтернативата на гражданите”, завършва публикацията си той. ",
                "_ownerId": "1",
                "category": "16",
                "region": "8",
                "_createdOn": 1698153358000,
                "_updatedOn": 1698153493000
            },
            "12286": {
                "title": "Апелативният съд във Варна потвърди задържането на Нургин Д., хванат с над 1,3 кг марихуана",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/44efe82070237216b330261bd26003bb.webp",
                "article": "Апелативен съд – Варна оцени като правилно и законосъобразно определението на Окръжен съд – Силистра, с което мъж, обвинен в държане с цел разпространение на високорискови наркотици е бил задържан под стража. Обвиняемият обжалва пред настоящата инстанция. В къщата, която Нургин Д. обитава били открити 122.5 грама марихуана, а в автомобила, който той управлявал – 1 181 грама. Представителят на Апелативната прокуратура заяви, че събраните доказателства категорично обосновават подозрението за съпричастност на 29-годишния мъж. Опасността той да извърши престъпление при по-лека мярка се базира на механизма на деянието и на количеството иззето забранено вещество. Адвокатът на Нургин не вижда никакви доказателство за това, че подзащитният му е извършил престъплението, за което е обвинен, нито за опасност да извърши престъпление при промяна на мярката за неотклонение. Ако остане под стража, няма да може да се грижи за малолетното си дете. Освен това обвиняемият страда от туберкулоза и има сериозно увредени бели дробове. Престоят в ареста би застрашил живота и здравето му. Апелативният съд счете, че достатъчно доказателства дават основание на прокуратурата да подозира в съпричастност Нургин Д. В тази насока са резултатите от претърсванията и изземванията, експертната справка на канабиса и свидетелските показания. Опасността от извършване на престъпление се извежда от характера и обществената опасност на деянието. Съгласно практиката на Европейския съд за правата на човека, при първоначалното вземане на мярка за неотклонение общественият интерес може да надделее над личните права и да обоснове задържането под стража. Голямото количество намерена марихуана на две места мотивира въззивната инстанция да сподели извода за изключителна обществена опасност в този случай. В същото време съдът не разполага със специални знания, за да коментира здравословното състояние на задържания. Актуалният здравен статус може да се установи само чрез съдебно-медицинска експертиза. С тези доводи Варненският апелативен съд реши, че обжалваното определение на Силистренския окръжен съд трябва да бъде потвърдено. Определението не подлежи на обжалване.",
                "_ownerId": "1",
                "category": "21",
                "region": "3",
                "_createdOn": 1698154423000,
                "_updatedOn": 1698154531000
            },
            "12287": {
                "title": "16-годишен младеж загина в катастрофа на опасното кръстовище край Калипетрово",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/258a53f26f91c15ef90ce85eccb3caf7.webp",
                "article": "16-годишен младеж загина при тежка катастрофа в Силистра, съобщават от Областната дирекция на МВР. Катастрофата е станала на снощи около 22:30 часа. При управление на лек автомобил \"Фолксваген\" по път I-7 на кръстовището с път II-21 по-познато, като кръстовището на смъртта, 20-годишният водач е загубил контрол над колата, която напуснала платното и се ударила в дърво. В резултат на удара на място е загинал 16-годишен пътник. Водачът, както и друг мъж, пътувал в колата, не са пострадали. На местопроизшествието е извършен оглед. Изясняват се причините за произшествието, образувано е досъдебно производство. Статистиката показва, че през септември на територията на Силистренска област са настъпили 23 пътнотранспортни пътешествия, седем от които тежки. При инцидентите са загинали двама души, а ранените са 10.",
                "_ownerId": "1",
                "category": "11",
                "region": "7",
                "_createdOn": 1698218333000,
                "_updatedOn": 1698225613000
            },
            "12288": {
                "title": "Ивелин Статев и кандидатите за общински съветници на ПП ГЕРБ се срещнаха с учителите в Силистра",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/27bb1d50a3362d299fb368f9b2babdb3.webp",
                "article": "Ивелин Статев, кандидат за кмет на община Силистра: Образованието е в основата на бъдещето на града. Обновената образователна инфраструктура е част от визитката на града ни. На предизборна среща с учители бе представена листата на ПП ГЕРБ за общински съветници и кандидатът за кмет на община Силистра г-н Ивелин Статев. В листата са включени четирима директори на училища: Калоян Нейков-СУ\" Н. Вапцаров\", Веселин Суров -СУ \"Дръстър\", Ралица Михайлова - ПГПТ\"Е. Георгиев\", Денка Михайлова- ПГСУАУ \"А.Буров\". В срещата участва и кметът на общината д-р Юлиян Найденов, който подчерта, че образованието и обучението на подрастващите ще продължи да е приоритет в работата на администрацията. На срещата присъстваха и кандидатите за общински съветници: д-р Мария Димитрова, Мария Недялкова Десислава Георгиева, Яна Райнова, Мирослава Червенкова, Стоян Узунов, Георги Спасов. ",
                "_ownerId": "1",
                "category": "8",
                "region": "5",
                "_createdOn": 1698225772000,
                "_updatedOn": 1698225772000
            },
            "12289": {
                "title": "В препълнена зала, Александър Сабанов закри кампанията си в село Калипетрово",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/43f4a9ec4f9f119efb7d919fea62222e.webp",
                "article": "\"Вчера, закрихме кампанията в с. Калипетрово, където се срещнахме с жителите на селото заедно с кандидатите за общински съветници от “Алтернативата на гражданите” и БСП и кандидатката за кмет на селото Цветанка Йорданова\", съобщава Сабанов в личния си Facebook профил. Изложихме програмата си и как заедно ще донесем промяната в общината и как с общи усилия ще изградим бъдещето на Силистра. Подчертах, че е важно да има единство и сътрудничество между всички политически сили, които искат да работят за доброто на общината. Призовах хората да гласуват за мен и за партньорите които ме подкрепят на изборите на 29 октомври. ",
                "_ownerId": "1",
                "category": "3",
                "region": "5",
                "_createdOn": 1698241124000,
                "_updatedOn": 1698241124000
            },
            "12290": {
                "title": "Ивелин Статев и кандидатите за общински съветници на ПП ГЕРБ се срещнаха с работещите в ЗММ \"Стомана\"",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/9db29ed75f58e640ef15e424bd455a75.webp",
                "article": "Кандидатът за кмет на община Силистра г-н Ивелин Статев и кандидатите за общински съветници от ПП ГЕРБ посетиха фирма \"Стомана\"АД. \"Много са предизвикателствата пред бизнеса в тези години\"- подчерта инж. Никола Митиков. Той се обърна към кандидатите за местна власт с послание:\" За да има благоденствие за народа ни трябва да има добро образование.\" И още:\"Това би трябвало да е приоритет в работата на администрацията. Да създаде среда за обучение, развитие на икономиката и младите хора.\" Ивелин Статев, кандидат за кмет на община Силистра подчерта, че въпреки твърденията, че няма работа в Силистра, работодателите търсят работници и при това с добро заплащане. Той пое ангажимент да разговаря с отговорните институции, за да се чуе волята на предлагащите заетост. В срещата участваха кандидатите за общински съветници от ПП ГЕРБ: Чавдар Петров, Тодор Велинов, Павлин Иванов, Денка Михайлова, Веселин Суров, Яна Райнова, Мирослава Червенкова, Орлин Николов, Стоян Узунов, Денислав Димитров, Ивелин Неделчев, Веселин Калчев. ",
                "_ownerId": "1",
                "category": "23",
                "region": "2",
                "_createdOn": 1698241351000,
                "_updatedOn": 1698241351000
            },
            "12291": {
                "title": "Нарязаха билборд на кандидат за кмет на Силистра",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/0f2d0037f7bcb262179d5e6130457a05.webp",
                "article": "Сигнал, че е извършен опит за саботиране на кампанията на независимия кандидат Александър Сабанов за кмет на Община Силистра е подаден в понеделник в неговия Инициативен комитет, съобщават от предизборния му щаб до медиите. По информация на анонимен свидетел вандалщината е извършена на 21 октомври около 22:30 часа, като двама маскирани са нарязали билборда, след което са напуснали на бегом мястото на инцидента. В резултат на това сериозно е повредено виниловото платно с размери 2\/ 4 метра От инициативния комитет са подали жалби до на РУ-Силистра и ОИК – Силистра.",
                "_ownerId": "1",
                "category": "5",
                "region": "7",
                "_createdOn": 1698241570000,
                "_updatedOn": 1698241570000
            },
            "12292": {
                "title": "Кандидатите за общински съветници на ПП ГЕРБ се срещнаха с работещите в \"Стеаринос\"",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/767bf141db36caa53d0056a59dd19755.webp",
                "article": "Днес кандидатите за общински съветници от ПП ГЕРБ се срещнаха с хората работещи в Стеаринос. Във фирмата работят около 50 жени, заплащането е над минималната работна заплата, но недостиг на работници има и в този сектор. Проблемите с инфраструктурата и тук е на дневен ред, защото производство се разраства и халетата са тесни за работа. На срещата присъстваха кандидатите за общински съветници от ПП ГЕРБ: д-р Мария Димитрова, Денка Михайлова, Георги Спасов, Тодор Велинов, Мирослав Димитров, Денислав Димитров и Чавдар Петров. ",
                "_ownerId": "1",
                "category": "23",
                "region": "5",
                "_createdOn": 1698241765000,
                "_updatedOn": 1698241773000
            },
            "12293": {
                "title": "Александър Сабанов: Най-големите силистренски села ще останат с дупки и разбити улици!",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/094399d675719556f7bb4843d4f4272c.webp",
                "article": "Днес заедно с кандидатите за общински съветници от МК „Алтернативата на гражданите“ посетихме ВиК-Силистра. За мен като кандидат за кмет ме интересуваха въпросите, които ми задаваха хората от най-големите силистренски села Айдемир и Калипетрово – какво става с водния цикъл? Отговора на управителя на дружеството беше крайно неудовлетворителен. Инж. Тодоров заяви, че всички обекти вече имат Акт 15 и строителните дейности са приключили и предстои само да се заплати на изпълнителя. Това означава, че няма да се асфалтират повече улици в двете най-големи силистренски села! Това е недопустимо! Жителите на Айдемир и Калипетрово вече години наред чакат да бъдат асфалтирани улиците им. Те са измъчени от дупки и разбит асфалт, които създават сериозни проблеми за движението на автомобили и пешеходци. След дъждовете и снеговете през есенно-зимния период жителите на тези населени места ги очакват много неприятни изненади, като дупки, потъващи в асфалта коли и отнесен чакъл. Аз обещавам, че ако бъда избран за кмет, ще направя всичко възможно да се асфалтират улиците в Айдемир и Калипетрово. Жителите на тези населени места заслужават да имат нормални пътища, по които да се движат безопасно. Ако не сте доволни от това как се управлява община Силистра, гласувайте за мен на 29 октомври с №70! ",
                "_ownerId": "1",
                "category": "6",
                "region": "4",
                "_createdOn": 1698242103000,
                "_updatedOn": 1698242157000
            },
            "12294": {
                "title": "Кандидати за местните власти в община Силистра се срещнаха с ръководството на „В и К“  ООД",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/24b224212e7495201980f61dc7c90594.webp",
                "article": "Работни срещи по проблемите на сектор В и К в Силистра бяха проведени с домакинството на инж. Тошко Тодоров – управител на „В и К“ ООД – Силистра. В тях участваха представители на Коалиция „ПП-ДБ“ в лицето на арх. Мария Илчева-Иванова – кандидат за кмет на община Силистра и водач на листата, заедно с кандидати за общински съветници от коалицията; представители на ПП „Възраждане“ в лицето на Петко Добрев - кандидат за кмет на общината и др.; Александър Сабанов – независим кандидат за кмет на община Силистра и кандидатите за общински съветници от листата на МК \"Алтернативате на гражданите\"; представители на ПП ГЕРБ – д-р Мария Димитрова – кандидат за общински съветник и общински председател, заедно с колеги - кандидати за общински съветници. В срещата с ПП-ДБ участва и народният представител Стоян Георгиев, който е част от парламентарната група на едноименната коалиция. Кандидатите на партиите и коалицията зададоха въпроси, събрани по време на срещите им с граждани, вълнуващи се от теми, като състояние на системата за водоподаване и за пречистване на водите, както и от цената на питейната вода. Инж. Тодоров представи дейността на работата на организацията, която ръководи, както и проблемите за решаване, стоящи пред нейното ръководство. Част от тях са свързани с мащабния проект „Изграждане на ВиК инфраструктура за обособената територия на „Водоснабдяване и канализация“ ООД – град Силистра“, финансиран от Оперативна програма „Околна среда 2014-2020“, с уточнението, че работата по СМР във връзка с него е напълно завършена. Според инж. Тодоров, „През 2023 година имаме преизпълнения на своите задължения към община Силистра“, но за в бъдеще е необходимо специално отношение от страна на общината към работата на В и К, в което общината е най-голям съдружник, за да се справи дружеството още по-добре със своите задачи. За целта е необходимо по-тясно взаимодействие при подготовката и реализацията на съвместната инвестиционна програма, в съставянето на която общината трябва да е по-активна със свои предложения за всяка следваща година. По мнение на присъстващите са необходими информационни кампании по различни теми, както и рекламиране на работата на В и К с цел показване на възможностите на дружеството. Включително по адрес на бизнеса за ползване на пречиствателната станция, вместо фирмите да планират изграждане на собствени, каквито примери има в миналото. Препоръчано бе по-често ръководството и специалистите от В и К да участват в работата на постоянните комисии на Общински съвет – Силистра, за да разясняват възникнали проблеми и начините за разрешаването им. Напомнено бе, че изграждането на водоснабдителната система на Добруджа в миналото е национално усилие, както и, че „Група Силистра“ в нея е най-важната – тя подава вода за 2\/3 от населените места в област Силистра, тъй като местните водоизточници са резервни. Всичко това изисква добро взаимодействие с местните власти, за да се избягват недоразумения по повод други проекти, предвиждащи с много лека ръка местене на улици, изграждане велосипедни алеи върху В и К-съоръжения, което се отразява на системите, предоставени за стопанисвани и управление на дружеството. По подобен начин са възникнали проблеми в резултат на засечката в реализацията на проектите за Дунавския парк и за водния цикъл, довела до извода за необходимост от по-внимателно проектиране с активното участие на община Силистра. Сред направените препоръки бе и необходимостта за по-сериозен съвместен контрол при извършване на дейностите по всеки проект в сферата на водоподаването и пречистването на отпадни водите. С уточнението, че собствеността на съоръженията е на общините с ангажименти на нейните специалисти и при проектирането. Задължения на общината е и да иска отстраняването на проблеми, възникнали при провеждането на проекти, когато са в рамките на годините за гаранция (примерно 10 г. за пречиствателната станция). В момента В и К е в режим на изпълнение на 15-годишен план със съответствие за всяка година. Ключът в неговото изпълнение е непосредственото общуване между кметската администрация и ръководството на „В и К“, още в началото на новата година за набелязване на по-мащабни проекти. Това ще осигури работата да върви в синхрон между двете институции в общо направление. Сред коментираните проблеми е и цената на водата и услугите, която е единна за цялата област и се определя от КЕВР в края на всяка календара на година на база на инфлацията в страната. От В и К уведомиха участниците в срещата, че в хода на дейността са набелязани и проблеми, свързани с наличието на един-единствен производител на асфалт, с чийто режим на работа трябва да се съобразяват в процеса на довършване на проектите при асфалтиране, както и с намирането на кадри, необходими в многоаспектната дейността на дружеството. В края на срещите управителят инж. Тошко Тодоров показа материалната база на своите гости. Обсъдена бе нуждата от обновяване на техниката, с която работят екипите на дружеството. Голяма част от нея са модели, произведени през миналия век, поради което вече са безкрайно амортизирани, неикономични на енергия и недостатъчно ефективни за експлоатация.",
                "_ownerId": "1",
                "category": "16",
                "region": "7",
                "_createdOn": 1698242905000,
                "_updatedOn": 1698242965000
            },
            "12295": {
                "title": "Случай на побой от кандидат за общински съветник в Силистренско - препратен на СГП",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/42cd6cdd207db9fc18746bb4b2fcdadd.webp",
                "article": "Случай за нанесен побой от кандидат за общински съветник и баща му над жител на селото, в което живеят, ще бъде изпратен по компетентност в Софийска градска прокуратура, съобщи БНР. Жалба от потърпевшия е подадена в Районното полицейско управление в Силистра, както и до Общинската избирателна комисия от една от политическите партии в града. 34-годишен мъж от с. Смилец е подал сигнал, че е бил нападнат от кандидат за общински съветник и от неговия баща, местен земеделски производител, заради това, че е скъсал предизборен плакат. Лицето не е медицински освидетелствано поради отсъствие на единствения в областта съдебен лекар, но има видими следи и към материалите са приложени снимки от полицейски експерт-фотограф. Нарушение на изборното законодателство няма, но в деянието е замесен участник в изборния процес, заради това случаят от полицията е предаден на Районна прокуратура – Силистра, а от там утре ще бъде пратен по компетентност на Софийска градска прокуратура. Указанията са, че при престъпления от общ характер, касаещи изборите – увреждане на имущество, късане на агитационни материали, вербална или физическа агресия, когато са намесени лица с имунитет според чл. 35, ал. 4 от НПК – материалите да се изпращат в София. До момента от Районна прокуратура - Силистра има изпратени по компетентност до Софийска градска прокуратура два случая. Колко ще са до края на седмицата не ясно, но сигнали постъпват непрекъснато. ",
                "_ownerId": "1",
                "category": "4",
                "region": "2",
                "_createdOn": 1698304493000,
                "_updatedOn": 1698304493000
            },
            "12296": {
                "title": "Александър Сабанов пред близо 5000 души: Заедно към по-добро бъдеще за Силистра!",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/93d068bc67a68de2b24b3ea291d546af.webp",
                "article": "Вчера вечерта в Силистра независимият кандидат за кмет на Община Силистра Александър Сабанов частично закри своята кампания с вдъхновяващ концерт на \"Тоника СВ\" на централния площад \"Свобода\". На сцената до Александър Сабанов застанаха водачите на всички листи, които го подкрепят. Заедно те показаха, че макар и с различни мнения, всички споделят общата вяра в по-доброто бъдеще на Силистра. Сцената на стана символ на обединение и солидарност, където разликата отстъпиха пред желанието за промяна. Пред близо 5,000 души Сабанов говори с вдъхновение и решимост да направим Силистра по-добра, по-силна и по-единна. \"Времето минава много бързо. За последните 10 години община Силистра изгуби над 7 000 жители. Изключително важно е да задържим младите хора в града и да създадем условия, които да ги мотивират да останат и да работят тук\". Александър Сабанов подчертава нуждата от подобряване на инфраструктурата и чистотата в града. Тротоарите и уличната инфраструктура се нуждаят от спешен ремонт, а чистотата в града е приоритет, който трябва да се реши. Сабанов бе категоричен, че страхът трябва да изчезне. Независимият кандидат за кмет призовава гражданите да изразят своите гласове свободно, без страх от наказания или заплахи. Александър Сабанов призовава всички граждани на Силистра да се обединят и да дадат своя глас на изборите. \"Това е възможността да подкрепим инициативите, които ще променят Силистра към по-добро\", заяви той. ",
                "_ownerId": "1",
                "category": "11",
                "region": "5",
                "_createdOn": 1698304746000,
                "_updatedOn": 1698304770000
            },
            "12297": {
                "title": "ПП ГЕРБ закри кампанията си в село Калипетрово",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/d172ee915ea787497b4364a41f686e9f.webp",
                "article": "На предизборна среща с кандидата за кмет на село Калипетрово г-н Никола Узунов, с кандидата за кмет на община Силистра г-н Ивелин Статев и кандидатите за общински съветници от ПП ГЕРБ вчера вечерта в местното читалище бяха посочени новите ангажименти, с които хората биха живяли в по-добра среда. В обръщението си към хората, г-н Никола Узунов подчерта, че: над 46 км е уличната мрежа в селото и всички очакват да има асфалт и добра инфраструктура; осветление; детски площадки и игрища. Много са изградените съоръжения и всеки може да се възползва. Но мандатът беше труден: без стабилност в страната, без сигурност за здравето на хората, без политическа стабилност, с растящи цени и инфлация и без бюджет за общинските разходи и заложената инвестиционна програма. Всичко това са обстоятелства, които не са спомогнали за покачване качество на живот. Предизборната среща откри г-жа Денка Михайлова.Тя представи кандидатите за общински съветници от ПП ГЕРБ: д-р Мария Димитрова, Мария Недялкова, Мирослава Червенкова, Яна Райнова,Ивелин Неделчев, Десислава Георгиева, Павлин Иванов, Ралица Михайлова, Константин Стоилов, Тодор Велинов, Мирослав Димитров, Денислав Димитров, Стоян Узунов, Веселин Калчев, Чавдар Петров, Валентин Перчемлиев Орлин Николов. ",
                "_ownerId": "1",
                "category": "18",
                "region": "3",
                "_createdOn": 1698305030000,
                "_updatedOn": 1698305030000
            },
            "12298": {
                "title": "Д-Р ЮЛИЯН НАЙДЕНОВ: Честит Димитровден!",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/fcefe37d9658b143344e630073b62793.webp",
                "article": "Честит имен ден на всички, които носят името на Свети Димитър Солунски! Бъдете здрави и закриляни от светеца си! Честит професионален празник на строители, архитекти, проектанти, строителни инженери, ковачи, техници. Нека изграденото от Вас бъде стабилна основа за развитието на България! Честит храмов празник на църквата \"Свети великомъченик Димитрий Мироточиви\" в село Калипетрово! На многая и благая лета! Д-Р ЮЛИЯН НАЙДЕНОВ, кмет на община Силистра",
                "_ownerId": "1",
                "category": "23",
                "region": "5",
                "_createdOn": 1698313737000,
                "_updatedOn": 1698313737000
            },
            "12299": {
                "title": "Отново разкъсан билборд - този път на кандидат за общински съветник",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/641a6ba8654141174d6865bebd97134c.webp",
                "article": "Във вторник общинската избирателна комисия е излязла с решение по жалба подадена от Мария Димитрова, представител на ПП ГЕРБ. От предизборния щаб съобщиха за медиите, че винилното платно е скъсано 2 пъти в рамките на 48 часа. Публикуваме решението на комисията без редакторска намеса. РЕШЕНИЕ № 122-МИ Силистра, 24.10.2023 ОТНОСНО: Сигнал от предизборния щаб на ПП ГЕРБ представляван от Мария Димитрова Димитрова за разкъсан билборд, поставен на улица „Добрич“ С вх.№133-МИ от 24.10.2023 г. е постъпил сигнал от предизборния щаб на ПП ГЕРБ, представляван от Мария Димитрова Димитрова за разкъсан билборд поставен на улица „Добрич“. В сигнала се твърди, че на 20.10.2023г. е установен разкъсан билборд на ПП ГЕБР, поставен на улица Добрич, срещу училище „Иван Вазов“. Жалбоподателят счита, че това е грубо нарушение и на Изборен кодекс в съответствие с чл.183 от него и моли ОИК-Силистра да предприеме необходимите действия. В ОИК – Силистра, веднага беше извършена проверка, по постъпилия сигнал, като длъжностни лица от комисията посетиха посочения в жалбата адрес, а именно ул.“Добрич“ срещу училище „Иван Вазов“ и установиха, че агитационния материал е разкъсан по-средата, както е посочено в жалбата. В хода на проверката се констатира, че разкъсаната част от билборда е залепена от собственика му. Общинска избирателна комисия-Силистра, счита, че действително е налице нарушение на чл.183, ал.5 от Изборния кодекс, който гласи: “Забранява се унищожаването и заличаването на агитационни материали, поставени по определения в кодекса ред, до края на изборния ден.“ Жалбоподателят Мария Димитрова Димитрова, не посочва данни за извършителя на нарушението, като такъв не беше установен и при извършената проверка от ОИК-Силистра, за да бъде предложен за подвеждане под административно-наказателна отговорност. В хода на проверката се установи, че са налице данни за извършено престъпление от общ характер по чл. 216, ал.1 от НК, а именно унищожаване и повреждане на чуждо движимо имущество и поради тази причина, следва копието от жалбата да бъде изпратено до РП-Силистра за извършване на проверка, съгласно Закона за съдебната власт. Предвид гореизложеното и на основание чл.87, ал.1, т.22 от Изборния кодекс, Общинска избирателна комисия Силистра РЕШИ: приема, че в подадения сигнал от предизборния щаб на ПП ГЕРБ, представляван от Мария Димитрова Димитрова се съдържат данни за извършено престъпление по чл. 216, ал.1 от НК, като копие от същата следва да бъде изпратено до РП-Силистра за извършване на проверка. Решението може да се обжалва в 3 \/три\/- дневен срок по реда на чл.87 от ИК пред Централна избирателна комисия. Председател: Марияна Борисова Чобанова Секретар: Севда Мюмюн Хюсеин",
                "_ownerId": "1",
                "category": "22",
                "region": "6",
                "_createdOn": 1698318026000,
                "_updatedOn": 1698322254000
            },
            "12300": {
                "title": "Петко Добрев от „Възраждане“: Бих управлявал Силистра с разум, човещина и дългосрочна визия",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/c9ff395474c524b6acf0b5bb135be827.webp",
                "article": "„Като цяло в нашата програмата искаме да се възползваме от географското положение на Силистра когато става въпрос за икономическия аспект, тъй като Силистра е граничен град, той граничи с Дунав и реката всъщност ресурса с най-голям потенциал за развитие на икономиката ни, но за съжаление централните власти - както изпълнителната, така и законодателната не обръщат внимание. Казвам като основен акцент например Силистра е благоприятно място за създаване на един логистичен център, който да обслужва целия дунавски регион, икономически за развитие на туризъм, за развитие на енергия, на култура. Това са все неща, които към настоящия момент, не само в Силистра, а изобщо не се използват в България. Предвидили сме също създаване на един общински гаранционен фонд, с който да подпомагаме младите предприемачи, но когато става въпрос за благоденствието, което ние си поставяме като основна цел, е редно да кажа, че не може да мислим само за икономическите аспекти, за икономическите проблеми, напротив, който и да е елемент от обществената серия, ако куца, няма как да постигнем условия, които да бъдат благоприятни за живот и за правене на бизнес, изобщо за отмора и почивка на хората. Така че ние мислим както за социалните дейности, които трябва да се развият, за спорта, за културата, за най-малкия човек и за най-големия човек за неговите проблеми.“, каза кандидатът за кмет от „Възраждане“ Петко Добрев в интервю по Евроком. Според него, всичко, което изброява може да бъде постигнато от една страна само с интелект, без да са необходими средства, а за други безспорно ще са нужни и финансови средства. „Бих управлявал с разум и човещина. Тоест с една правилна и разумна политика с решения, които както казваме ние, трябва да имат дълъг хоризонт на действие, да бъдат рационални, може много да се постигне, ако имаш желание. Давам ви един прост пример, общината сама не може да инвестира за създаване на такъв логистичен център, какъвто ви казвам, но това е една география, която ние можем да представим пред целия свят, пред световни инвеститори и те да реализират едно партньорство с общината. Инвестиции са необходими и такива има, получават се както от републиканския бюджет, така от европейските средства, но за голямо съжаление при нас не е правен анализ за използването на тези средства, тоест ние говорим само за пропуснати ползи или за вреди, които са нанесени на хората, които живеят. В същото време трябва да говорим за онова, което трябва да постигнем като положителен резултат.“, допълни Петко Добрев. „Възраждане“ е с N42 в бюлетината! КУПУВАНЕТО И ПРАДАВАНЕТО НА ГЛАСОВЕ Е ПРЕСТЪПЛЕНИЕ!",
                "_ownerId": "1",
                "category": "17",
                "region": "4",
                "_createdOn": 1698340501000,
                "_updatedOn": 1698340501000
            },
            "12301": {
                "title": "Близо 230 служители на МВР ангажирани с охраната на местните избори в Силистренска област",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/90dfa2c8ae541cd3b2f8bbd7e78b99cb.webp",
                "article": "В ОДМВР-Силистра е създадена организация за гарантиране на сигурността, противодействие на престъпленията против политическите права на гражданите и опазване на обществения ред при подготовката и произвеждането на изборите за общински съветници и кметове на 29 октомври 2023 г. и при втори тур на 5 ноември 2023 г. В охраната на изборния процес пряко са ангажирани близо 230 служители на ОДМВР-Силистра, РД „Пожарна безопасност и защита на населението” и РД „Гранична полиция”. Във всички изборни места са извършени предварителни охранителни и противопожарни проверки. Предприети са действия за обезпечаване на реда и охраната на изборните материали, устройствата за електронно гласуване и изборните помещения при подготовката, произвеждането и до окончателното приключване на изборния процес. Създаден е оперативен щаб, оглавяван от директора на ОДМВР-Силистра старши комисар Мартин Недялков, който ръководи и координира силите и средствата на областната дирекция по обезпечаване на сигурността и обществения ред. Предприети са мерки за осигуряване на ефективен пътен контрол и въвеждане на необходимата организация на движение по маршрутите и около местата за подготовка и произвеждане на изборите. За да могат гражданите, които не притежават валидни лични документи поради различни причини да упражнят правото си на глас, паспортните гишета ще работят на 28 октомври от 08:30 до 17:00 часа и на 29 октомври от 08:30 до 19:00 часа. Сигнали за престъпления или нарушения, възпрепятстващи нормалното протичане на изборния процес, могат да се подават на денонощната телефонна линия – 086\/886 331, и имейл odc.silistra@mvr.bg в ОДМВР-Силистра, както и на 02\/90 112 98 и имейл izbori@mvr.bg в Министерството на вътрешните работи.",
                "_ownerId": "1",
                "category": "18",
                "region": "7",
                "_createdOn": 1698396482000,
                "_updatedOn": 1698396482000
            },
            "12302": {
                "title": "Ивелин Статев и кандидатите за общински съветници на ПП ГЕРБ се срещнаха с работещите в \"Марлин\" ЕООД",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/118a0a8f456e6f01fedb27110c6875cc.webp",
                "article": "Кандидатът за кмет на община Силистра г-н Ивелин Статев и кандидатите за общински съветници от ПП ГЕРБ се срещнаха с работещите в \"Марлин\" - пристанище и силозна база. Българска агенция за инвестиции удостои със Сертификат Клас А за инвестиция силистренското дружество с ограничена отговорност \"Марлин\" Марин Калушев- представител на \"Марлин\" ЕООД- гр. Силистра. Фирмата изгражда складова база за съхранение на зърно в гр. Силистра и услуги по складиране и съхраняване на товари. Направените инвестиции са в размер на 50 милиона лева; за изграждане на силозна база с обхват от 240 хиляди тона и пристанищна инфраструктура; пристанище с до 6 кейови места и с капацитет до 7 хиляди тона на товарни и разтоварни дейности на денонощие. Държавата финансира изграждането на комуникации, водопреносна мрежа, от техническата инфраструктура. Ивелин Статев кандидат за кмет на община Силистра поздрави работниците и управителя на\"Марлин\" ЕООД. Такива инвестиции дават облика на бизнеса в Силистра. Като кандидат за кмет на община Силистра, той благодари за подкрепата, която му заявиха работниците. ",
                "_ownerId": "1",
                "category": "20",
                "region": "3",
                "_createdOn": 1698396753000,
                "_updatedOn": 1698396761000
            },
            "12303": {
                "title": "Александър Сабанов: В неделя да сменим не само времето на часовниците, а и модела на управление на Община Силистра",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/d871d625b180ea968b298bc3bd100469.webp",
                "article": "Денят 26 октомври започва с енергия и ангажимент, когато независимият кандидат за кмет на Община Силистра Александър Сабанов, заедно с кандидатите за общински съветници от \"Алтернативата на гражданите\", посети печатницата \"Ковачев\". Тук той се среща с управителя и служителите на фирмата и обсъди неотложните промени, необходими за бъдещето на общината. Откритото бяха обсъдени идеите и приоритети заложени в основите на предизборната кампания за по-светло бъдеще на Силистра. Александър Сабанов и кандидатите за общински съветници от \"Алтернативата на гражданите\" прекараха време със служителите на \"Лактоком\", обсъждайки приоритетите в предизборната им програма. Собствениците на фирмата, Иван и Станислав Ковачеви, които са неразделна част от екипа на предизборната кампания, заявиха своята безрезервна подкрепа за Александър Сабанов. Александър Сабанов взе участие в Храмовия си празник отбелязан днес в църквата на силистренското село Калипетрово \"Свети великомъченик Димитрий Солунски\", която е на близо 180 години. Счита се, че Димитровден е подходящ момент за размисъл и преоценка на житейските приоритети. За Александър Сабанов те са ясни - изграждането на нова Силистра, наситена с мир, чистота, ред и гаранции за бъдещето. През следобеда Александър Сабанов посети квартал \"Деленките\" в село Айдемир, където той и колегите са от БСП, \"Алтернативата на гражданите\" и кандидатът за кмет на населеното място Миглена Павлова се срещнаха с жителите му в междублоковото пространство. Тук, Сабанов споделя своята обширна програма и визия за по-чиста и процъфтяваща Силистра. В най-голямото село в Айдемир се проведе предизборна среща в НЧ \"Родолюбие\". Александър Сабанов, съпроводен от кандидатите за общински съветници от БСП, \"Алтернативата на гражданите\" и \"Левицата\", както и кандидатът за кмет на селото, Миглена Павлова, се обърнаха към присъстващите с посланието, което беше ясно - настъпило е време за промяна, да сменим не само времето на часовниците, а да сменим модела на управление на Община Силистра, за да може младите хора да не напускат родния край, а всички да живеем в едно по-добро място. Сабанов сподели и притесненията си от приключилия „воден цикъл“ в селото, който е оставил след себе си само дупки и неасфалтирани улици. Александър Сабанов призова всички да излязат на 29 октомври и да гласуват. Срещата завърши с фолклорен концерт с участието на местните групи от Айдемир и Силистра. Гласувайте за промяна на изборите на 29-ти октомври за Александър Сабанов с номер 70 в бюлетината и всички други кандидати, които го подкрепят, и представляват алтернативата за по-добро бъдеще на Силистра! ",
                "_ownerId": "1",
                "category": "22",
                "region": "4",
                "_createdOn": 1698397313000,
                "_updatedOn": 1698397313000
            },
            "12304": {
                "title": "Военнослужещи от Сухопътните войски унищожиха невзривен боеприпас край Тутракан",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/1aeda38f970f75c5d5193c6d03c47019.webp",
                "article": "Формированиeто за овладяване и\/или преодоляване на последствията от бедствия за унищожаване на невзривени боеприпаси на военно формирование 34200 – Шумен, разузна, транспортира и унищожи невзривен силно корозирал 120 мм артилерийски снаряд. Боеприпасът е намерен на 26 октомври при извършване на ремонтни дейности в мемориален комплекс „Военни гробища“ в село Шуменци, област Силистра. Формированието действа под ръководството на капитан Свилен Йосифов по заповед на командира на Сухопътните войски.",
                "_ownerId": "1",
                "category": "3",
                "region": "6",
                "_createdOn": 1698403560000,
                "_updatedOn": 1698403585000
            },
            "12305": {
                "title": "ГЕРБ Силистра подаде две жалби в Общинската избирателна комисия",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/6b3b8b625a88eb0a69f2cc03703f92e7.webp",
                "article": "Председателят на Предизборния щаб на ПП ГЕРБ тази сутрин подаде две жалби до ОИК-Силистра, съобщават от партията на Бойко Борисов до медиите в Силистра. ​\"В нарушение на ИК, чл. 66, ал. 1,т.1 е видно, че член на СИК е съпруга на кандидат за общински съветник. ​Втората жалба отчита факта, че са поставени агитационни материали в непосредствена близост до избирателни секции в Силистра и в с.Айдемир\", завършва съобщението. Очаква се решението на комисията.",
                "_ownerId": "1",
                "category": "11",
                "region": "2",
                "_createdOn": 1698575214000,
                "_updatedOn": 1698575214000
            },
            "12306": {
                "title": "Тодор Тодоров и Ивелин Статев упражниха правото си на глас",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/27fa1eddec6c7f102e23b725a49f1baa.webp",
                "article": "Днес, рано сутринта от ПП ГЕРБ споделиха, че областния координатор Тодор Тодоров и кандидатът за кмет Ивелин Статев са упражнили правото си на глас. Ето какви послания отправиха чрез партийната Facebook страница те: Тодор Тодоров: Гласувах! Като областен координатор на ПП ГЕРБ и член на ИК, пожелавам на всички кандидати за кметове, кметове на населени места и общински съветници УСПЕХ! Нашите умения, знания и единство работят за всички в Силистра. Ивелин Статев: Гласувах! Решително да работим за Силитра! Той упражни правото си на избор тази сутрин в 7.00ч, в 137 секция в Силистра. Това беше първата пусната бюлетина в избирателната урна.",
                "_ownerId": "1",
                "category": "22",
                "region": "3",
                "_createdOn": 1698576187000,
                "_updatedOn": 1698576187000
            },
            "12307": {
                "title": "Александър Сабанов: Гласувах за по-добра и европейска Силистра",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/9d82d5ad1e760eff94b22205e53cc375.webp",
                "article": "Независимият кандидат за кмет на Община Силистра Александър Сабанов гласува в 10.00 часа в Избирателна секция 151, намираща се в ОУ \"Кирил и Методий\" в областния град. След това той се обърна към всички жители на община Силистра, чрез своите профили в социалните мрежи. Днес аз гласувах за един по-добър живот тук - за този град, който всички ние обичаме и който си представям, че ще започнем да възстановяваме заедно, незабавно след изборите. Днес аз гласувах за Силистра - за Силистра на бъдещето. За Силистра, в която майките могат спокойно да разхождат децата си с количките по нормални тротоари. За Силистра, в която работните места за младите хора не са просто обещания, а реалност, където те могат да изградят своето бъдеще и да развиват талантите си. Днес аз гласувах за Силистра без партийни назначения, защото вярвам, че управлението трябва да бъде базирано на заслуги и професионализъм, а не на политически изгоди. Силистра, в която живеем без комари, с удоволствие отиваме на работа, без страх за бъдещето си. Силистра, която е отворена към идеи, иновации и развитие и в която корупцията и непрозрачността нямат място. Заедно можем да построим тази Силистра. Вярвайте в бъдещето на този град, гласувайте за промяна, за Силистра, която всички ние заслужаваме. Възползвайте се от вашия глас и направете така, че той да бъде чут днес, на изборите за местна власт. Ако вярвате във визията ми за по-добра Силистра - гласувайте за 70 пъти по-добра Силистра. Благодаря ви!",
                "_ownerId": "1",
                "category": "8",
                "region": "8",
                "_createdOn": 1698576195000,
                "_updatedOn": 1698576195000
            },
            "12308": {
                "title": "Към 11:00 часа избирателната активност в община Силистра е 15,72%",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/afef45794b23c827d9cde46c932cc921.webp",
                "article": "15,72% е избирателната активност в Община Силистра към 11.00 часа. Гласували са 6798 души от общо 43 233 с право на вот, а за кметския стол в общината се борят петтима кандидати. От началото на изборния ден в ОИК-Силистра са постъпили няколко жалби, като общинската избирателна комисия все още не е взела решения по тях.",
                "_ownerId": "1",
                "category": "23",
                "region": "7",
                "_createdOn": 1698577317000,
                "_updatedOn": 1698577317000
            },
            "12309": {
                "title": "Към 16:00 часа избирателната активност в община Силистра е 34%",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/199c573504c2d21c3438c89100a15f8f.webp",
                "article": "Гласували са общо 14670 избиратели. Aктивността в община Силистра към 16:00 часа е 33,93 на сто, съобщават от Общинската избирателна комисия в Силистра. Само за справка, на предходните местни избори през 2019 година избирателната активност в общината към 17:30 часа е била 40,72 на сто, сочи справка на официалния сайт на ОИК. Припомняме, че за кметския стол в община Силистра се борят петтима кандидати.",
                "_ownerId": "1",
                "category": "17",
                "region": "2",
                "_createdOn": 1698590684000,
                "_updatedOn": 1698592844000
            },
            "12310": {
                "title": "КОЙ? Какво показват предварителните резултати и къде ще има балотаж в силистренско?",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/82b9b756ec0789088bcd54d6c4d2d1b8.webp",
                "article": "Днес се проведаха избори за кметове на общини и населени места, както и за общински съветници в цяла България. По информация на \"ПОРТАЛ СИЛИСТРА\" балотаж ще има в общините Силистра, Дулово и Тутракан. Очаквано в общините Главиница, Ситово, Алфатар и Кайнарджа кметът вече е избран на първи тур. В община Силистра за кметския стол към момента балотажът ще е между независимият кандидат Александър Сабанов и Ивелин Статев (ГЕРБ). В община Дулово очаквано битката е между д-р Юксел Ахмед (ГЕРБ) и инж. Невхис Мустафа (ДПС), като по непотвъррдена информация 200 гласа не достигат на един от кандидатите, за да спечели още на първи тур. В община Тутракан балотаж ще има и той ще бъде отново между независимият кандидат д-р Димитър Стафанов (подкрепен от ГЕРБ) и Нехат Кантаров (ДПС). В община Главиница печели досегашния кмет Неждет Джевдет (ДПС). В община Ситово жителите отново избират Сезгин Алиибрям (ДПС). В община Алфатар на първи тур печели отново досегашния кмет Янка Господинова (ГЕРБ). В община Кайнарджа без никакво съмнение победител е Любен Сивев (подкрепен от ГЕРБ), който ще започне своя 6-ти пореден мандат. Очаквайте скоро актуални резултати от обработените протоколи в ОИК.",
                "_ownerId": "1",
                "category": "4",
                "region": "5",
                "_createdOn": 1698618131000,
                "_updatedOn": 1698618389000
            },
            "12311": {
                "title": "ПЪЛЕН СПИСЪК С ИМЕНА: Ето кой влиза в новия общински съвет в Силистра?",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/65938b7e01e6f2c2e77f99b1a1a50bf0.webp",
                "article": "ОИК Силистра - Решение №169: Обявява по азбучен ред имената на избраните общински съветници ОТ ОБЩИНСКИ СЪВЕТ - СИЛИСТРА по партии, коалиции и местни коалиции, както следва: 8 - ГЕРБ: Ивелин Статев Иванов, Денислав Пламенов Димитров, Денка Димитрова Михайлова, Мария Димитрова Димитрова, Мария Иванова Недялкова, Стоян Киров Киров, Стоян Станков Узунов, Веселин Петров Суров 6 - КОАЛИЦИЯ \"АЛТЕРНАТИВАТА НА ГРАЖДАНИТЕ“: Венко Петров Начев, Георги Павлов Гайдаров, Станислав Иванов Ковачев, Лъчезар Тодоров Тодоров, Керанка Вълчева Иванова, Димитър Трендафилов Трендафилов 3 - СДП: Ганчо Маринов Неделчев Борислав Траянов Борисов, Йордан Стоянов Стоянов 3 - КОАЛИЦИЯ \"ЛЕВИЦАТА!\": Стоил Василев Стойчев, Илиана Димитрова Митева, Ростислав Николаев Манолов 3 - КОАЛИЦИЯ \"БСП ЗА БЪЛГАРИЯ\": Стелиян Стойчев Стойчев, Галина Русева Павлова, Теменужка Богданова Бухчева 2 - ДПС: Бирол Ерол Мехмед, Рефик Тефик Хадживат 2- СДС: Гален Мирославов Енев, Красимир Христов Димитров 2 - КОАЛИЦИЯ \"ГРАЖДАНИ ЗА ОБЩИНАТА\": Димитър Сашев Тодоров, Иванка Господинова Ташева 2- КОАЛИЦИЯ ПП-ДБ: Мария Христова Илчева-Иванова, Златко Стефанов Куртев, 2- „ВЪЗРАЖДАНЕ\": Марин Руменов Николов, Свилен Иванов Димитров",
                "_ownerId": "1",
                "category": "11",
                "region": "4",
                "_createdOn": 1698666892000,
                "_updatedOn": 1698667103000
            },
            "12312": {
                "title": "БСП-Силистра призова да се гласува за Александър Сабанов на балотажа на 5 ноември",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/efa3ca2c8e6ff8da2f0a251ea25343da.webp",
                "article": "Българската социалистическа партия в Силистра обявява своята подкрепа за независимият кандидат за кмет на общината Александър Сабанов за предстоящия балотаж на изборите на 5 ноември, неделя. В декларация, подписана от лидера на БСП в Силистра Стилиян Стойчев, се подчертава, че решението на партията да подкрепи Сабанов е продиктувано от убеждението, че той е единственият кандидат, който може да доведе до истинска промяна в общината. \"Силистра е един от най-красивите градове в България, но е срамно, че той тъне в разруха, няма работеща икономика и е на предпоследно място сред областните градове по ключови показатели\", се казва в декларацията. \"Ето защо е време за промяна! А за да има промяна подкрепете независимият Александър Сабанов - с номер 70 в бюлетината!\" Стойчев посочва, че Сабанов е доказан професионалист с опит в управлението и с ясна визия за развитието на Силистра. Той е убеден, че Сабанов ще успее да привлече инвестиции, да създаде работни места и да подобри качеството на живот на гражданите. \"Александър Сабанов е човекът, който може да направи Силистра по-добър град за живеене. Призоваваме всички граждани на общината да гласуват с №70 за него на 5 ноември\", заяви Стойчев. ",
                "_ownerId": "1",
                "category": "4",
                "region": "7",
                "_createdOn": 1698749782000,
                "_updatedOn": 1698749782000
            },
            "12313": {
                "title": "ВИДЕО: Скандален клип показа как се „броят“ преференции за общински съветници",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/b49605fc0367bf82e7992feb1a160eb4.webp",
                "article": "Манипулациите на вота по Северозапада не са новина. Изборите в неделя обаче произведоха такава, или по-скоро за пореден път показаха нагледно как Бай Ганьо прави избори, как манипулира и нищо не може да го спре - нито уж разнородните секционни комисии, нито видеонабюдението в реално време. И така, това е поредната врачанска история за това как изборите се купуват и продават. Действието се развива в с. Малорад, община Борован, секция №060500005. Всичко върви нормално и по правилата за честен изборен процес. След края на вота секционната комисия стартира видеонаблюдението, последователно отваря урните за бюлетини, показва към камерата какъв вот е отбелязван, регистрира невалидни гласове, брои чинно... изобщо няма изгледи, че нещо ще се случва. Два часа след старта на записа обаче, когато бюлетините за кмет на община, невалидните и тези с \"Не подкрепям никого\" са преброени, СИК решава да си даде почивка. - Запри го това! - казва мъж от секционната комисия в Малорад. - Пет минути да починем - предлага жената от СИК, която брои бюлетините. - После ще можеме ли да го стартираме? - пита друга жена от СИК. - Ще го стартираш! - отговаря ѝ спокойно мъжът, който поиска спиране на излъчването на живо. Същият седи до жената, която брои бюлетините. Стопкадър И тук започва интересното. Секционната комисия във врачанското село не е успяла да прекъсне видеозаснемането и видеоизлъчването, а всичко, което се случва в секцията в уж \"5-минутната почивка\", е излъчено на живо и достъпно на запис тук. Записът е показателен за това как българинът прави избори на тъмно и как без да се свени и в сговор манипулира резултатите. - Така, тук сме си наши момчета. Щете ли да помогнеме на Марти, на некой, на баче Цено, да ги направим на преференцията, да има хора от село там. Некой има ли претенции? - Зависи от комисията. Както кажете. - Не бе. Ние сме си наши хора. Да помогнем на Мартин примерно има едно, имало празна, да се попълни 102 например. - Аз немам никви претенции. - 42 със еди коя си. 108. За Борко да се направат, за сичките да има. За сичките. Казвайте да Ви помогна на сичките. Ако щете – щете. Ако не щете, тая работи да свършим, да хода да си легам. - Мен ми е на дедовия. - Казвайте. - 68 една част ше се прави за него. - Това си е Ваша работа. - Една част праиш за Боби. И ше се делат. Ше се делат. След това жената от секционната комисия, която броеше и искаше 5-минутна почивка, хваща купчинка с бюлетини и започва да ги поправя една по една. Дамата обаче не е запомнила в полза на кой кандидат да попълва и докато мисли, че никой не я снима, пред камерата, която излъчва на живо задава въпроса: - Чичо Цено, кой номер? Междувременно въпросният Чичо Цено се разпорежда за кои партии и кандидати също ще има помощ, защото са \"наши хора\". От записа се чува, че се обсъжда добавяне на преференции за третият в листата на БСП (Мартин Иванов Диловски), 11-ят в листата на СДС (Боби Младенов Боянов), както и осмият в листата на \"Възраждане\". Според справка в регистрите за кандидати за общински съветници на Борован това е именно въпросният Чичо Цено - Цено Ценов Цоловски. И така, Чичо Цено диктува за кои кандидати ще има помощ, а секционната комисия, в която уж има представители на всички политически партии, работи в абсолютен сговор. Създадена е и организация - един поправя бюлетините, друг пази вратата, трети дава инструкции. - Вратата - провиква се жена от СИК. - Идем - казва друга - Спри, спри, спри - подсказва тихичко трета жена от СИК. Уж броящата, а реално гласуваща представителка на секционната комисия прекратява писането по бюлетините. - Пак е нещо - успокояват я от секцията и добавят: Айде стига толкова. От записа става ясно още, че залата на секцията е била заключена, защото не били приключили и при броенето можело да са само членовете на СИК. Никой не подлага на съмнение обаче присъствието на героят на тази врачанска история - Чичо Цено, който е и кандидат в листата на партията на Костадин Костадинов. Малко по-късно се дописани още няколко бюлетини, но отново се чува призив да приключва дописването. В комисията си мислят, че видеото е спряно, но ще се \"включат\". Една жена поставя този въпрос и пита: \"Сигурни ли сме, че сме били спрени?\" В комисията не ѝ обръщат внимание, камерата леко се завърта и представителката на СИК, която допреди минути драскаше по бюлетините, продължава така, все едно нищо не се е случвало. Тя обявява на висок глас, че започват броенето на бюлетините за общински съветници. Кой каво може да направи? Според правилата Централната избирателна комисия не може да направи нищо по казуса, тъй като компетентна е общинската избирателна комисия - в случая ОИК- Борован. Ако някой от участниците във вота оспори резултата, то чувалите с бюлетините може да бъдат повторно отворени. За момента обаче това не се е случило. Дори напротив, ОИК - Борован вече обяви избраните общински съветници. OFFNews се свърза с ОИК-Борован, откъдето отказаха да коментират казуса, тъй като си имало говорител, чийто телефонен номер поискахме. Двата ни опита да се свържем с говорителката на общинската комисия бяха неуспешни. Двама от тримата герои в този разказ са избрани Чичо Цено - Цено Ценов Цоловски от \"Възраждане\" с 50 преференции в секцията и общо 127 за общината става общински съветник. Боби или Боби Младенов Боянов от СДС също влиза в общинския съвет в Борован с 85 преференции. В секцията в с. Малорад обаче явно не са успели да му помогнат, тъй като има само един глас за него. Единствен Мартин - Мартин Иванов Диловски от БСП не успява да стане общинар. В секцията той има 7 преференции, а в цялата община - 43.",
                "_ownerId": "1",
                "category": "6",
                "region": "2",
                "_createdOn": 1698750394000,
                "_updatedOn": 1698750408000
            },
            "12314": {
                "title": "ВИДЕО: Инж. Невхис Мустафа (ДПС) се обърна към своите избиратели в Дулово без филтри и без заучени термини",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/ec0de49a154f58cae5168f1c2973a29a.webp",
                "article": "В емоционално видео обръщение в личния си Facebook профил, досегашния председател на Общинският съвет в града и общински съветник - инж. Невхис Мустафа се обърна към своите приятели и симпатизанти. Припомняме, че тя бе издигната от Движението за права и свободи за кметския стол в община Дулово. След първия тур на изборите за местна власт тя отива на балотаж с досегашния кмет д-р Юксел Ахмед (ГЕРБ), който управлява 12 години общината. Според 100% обработени протоколи в сайта на ЦИК, ДПС успя да спечели подкрепата на 6484 души (48,01%), а ГЕРБ на 5808 души (43%). Във видеото инж. Мустафа благодари на всички гласували и дали своя глас за нея, както и на почетния председател на ДПС - Ахмед Доган и не на последно място на своя екип. Вижте повече във видеото: ",
                "_ownerId": "1",
                "category": "5",
                "region": "8",
                "_createdOn": 1698751485000,
                "_updatedOn": 1698752723000
            },
            "12315": {
                "title": "УТРЕ: Официална церемония по награждаване на личности и институции с принос в духовното развитие на Силистра",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/2a6a5c834fa4cd2d39e3791a470b7b89.webp",
                "article": "Официална церемония по награждаване от д-р Юлиян Найденов – Кмет на Община Силистра, на личности и институции с принос в духовното развитие на Силистра предстои утре, съобщават от администрацията. Денят на народните будители е светла дата, празник, на който се отдава почит на просветителите, книжовниците и революционерите, изградили и съхранили духовните ценности и националното самосъзнание на българите. В историята на Силистра са записани много имена на народни будители, сред които се открояват първият светски поет Партений Павлович, Сава Доброплодни, Илия и Рашко Блъскови, Евлампия Стоева и много други. Изключително голям е приносът на личности и институции в община Силистра за духовното развитие на града ни и околните населени места. За първи път, преди 10 години, по инициатива на д-р Юлиян Найденов, Община Силистра удостоява с грамоти и награди съвременни будители-наши съграждани за принос в духовното развитие. Отличените досега многоуважавани наши съграждани и творци са: Художниците Йордан Маринов \/покойник\/ и Георги Куртев; Негово Високопреосвещенство Доростолският митрополит Амвросий \/покойник\/; нашите млади съграждани – Виктория и Денислав Деневи; Световноизвестният музикант с добруджански родови корени Теодосий Спасов; Проф. д-р Иван Недев \/покойник\/ - с принос за научни постижения в областта на анализа на съвременния български книжовен език; Музикалният педагог и ръководител на Музикална студия „До ре ми” – Бонка Скорчелиева; За благодеятел на 2017г. – д-р Тодор Стаматов Тодоров – бизнесмен; Проф. д-р Иван Гаврилов - известен български лекар по обща, гръдна и онкохирургия, дарител, благодеятел и радетел за съхраняване на българската духовност и култура, Боряна Кьосева – хореограф-класически танци и ръководител на Балет „Б2; Благодеятел на годината-2018-та за дарения, направени в полза на общността и млади таланти във всички сфери на спорта и изкуството Йордан Радулов- „Елика-Елеватор” ООД, град Силистра, Румен Чернев- автор и дарител за кът за четене и отдих в Дунавския парк.Будител на нашето съвремие за 2019 г. - Христо Сарафов - артист-солист на Националния музикален театър „Стефан Македонски” за личен принос в духовното развитие на Силистра, за високи достижения в музикалното изкуство. През 2020 г. за будител на нашето съвремие за личен принос в духовното развитие на Силистра, научни постижения и всеотдайна обществена дейност по повод 130 години педагогическо образование в Силистра - доц. д-р Румяна Лебедова - директор на Филиал Силистра на РУ „Ангел Кънчев“, а за благодеятел на 2020 г. - Петранка Стефанова Русева-Симова - организатор за Силистра на кампанията „Дари капачки“. Будител на нашето съвремие 2021 година бе Марин Минев – Джона – фотограф, журналист и художник. Благодеятел на 2021 г. - Десислава Бетова - дъщеря на художника Тодор Цонев \/1934-2004\/, дарила на фонда на Регионален исторически музей - Силистра 41 произведения на баща си \/скулптура и графика\/. Будител на нашето съвремие за 2022 година - доц. д-р на Филологически науки Тодорка Георгиева - преподавател по български език в Катедрата по филологически и природни науки към Филиал – Силистра на Русенския университет „Ангел Кънчев”. Благодеятел – 2022 година - Ръководството на фирма „Поларис 8“ ООД. Осъществени дарения за „МБАЛ – Силистра“ АД и за развитие на общността. На 1 ноември 2023 г. от 17.00 ч. в зала 13 на Художествена галерия – Силистра, на официална церемония д-р Юлиян Найденов – Кмет на Община Силистра, ще награди личности и институции с принос в духовното развитие на Силистра.",
                "_ownerId": "1",
                "category": "3",
                "region": "8",
                "_createdOn": 1698751885000,
                "_updatedOn": 1698751885000
            },
            "12316": {
                "title": "\"Има такъв народ\" подкрепя Александър Сабанов за балотажа на 5 ноември",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/adf0b135ec0ca671ddc714fa3b343274.webp",
                "article": "Политическа партия \"Има такъв народ\" (ИТН) официално декларира подкрепата си за независимия кандидат за кмет на община Силистра Александър Сабанов на предстоящия балотаж на изборите на 5 ноември, неделя. В изявлението на областния координатор на ИТН в Силистра Венко Начев става ясно, че Сабанов е единственият кандидат за кмет, способен да поведе града към по-добро качество на живот. В декларацията се подчертава, че решението на партията да подкрепи Сабанов е в ясната визия за развитието на Силистра. Вярват, че той ще ръководи общината прозрачно и ще привлече така необходимите инвестиции. Важното е, че като независим кандидат Сабанов не е обвързан с политически партии и се ангажира да гарантира, че няма да се правят политически назначения в общинската администрация. Тази подкрепа е съгласувана с националното ръководство на \"Има такъв народ\". Партията призовава всички граждани на общината да дадат своя глас за Александър Сабанов с бюлетина №70 за следващ кмет на Силистра на 5 ноември 2023 г. Това одобрение отразява доверието на партията в ангажимента на Сабанов към положителните промени и развитието на Силистра. Това означава обединени усилия за постигане на по-светло бъдеще за града и неговите жители. ",
                "_ownerId": "1",
                "category": "6",
                "region": "7",
                "_createdOn": 1698752902000,
                "_updatedOn": 1698752902000
            },
            "12317": {
                "title": "Маршрутът Дунав Ултра влезе в полезрението на световния туризъм",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/5a2fa0e0b324354fcfe866dc7101e076.webp",
                "article": "Българският веломаршрут по поречието на река Дунав и Добруджа до Черно море - Дунав Ултра, влезе в годишна класация на Топ 50 препоръчани дестинации в цял свят за 2024 г., на \"Библията\" в пътешествията - гиганта Lonely Planet. В обширен материал на Кристофер Коли за изданието cа представени множество логистични препоръки и възможности за пътешествие с велосипед по маршрута. Специално е обърнато внимание на едноименното мобилно приложение Dunav Ultra и ежегодното събитие в неговата подкрепа - масово изминаване на Дунав Ултра на велосипед. Интересът към българския проект идва с номинирането от страна на Lonely Planet на международната дестинация \"Дунавски лимес\", като Дунав Ултра е посочен като поддържащ туристически продукт, предоставящ възможност за самоорганизирано пътешествие по \"Лимеса\" на територията на България на велосипед. За връзката на Дунав Ултра с дестинацията \"Дунавски Лимес\" са спомогнали включването на емблематични тематични обекти в т.нар. \"100 Дунав Ултра забележителности\" - вкл. крепостта Баба Вида (бивша римска крепост Бонония, бел.ред.), Улпия Ескус - с. Гиген, легионен лагер Нове - гр. Свищов, Сексагинта Приста - гр. Русе, Дуросторум - гр. Силистра и Белоградчишката крепост. Дунав Ултра е единственият препоръчан от Lonely Planet туристически маршрут на територията на Източни Балкани, което прави постижението уникален по рода си пробив в сферата на туризма за България, предоставяйки възможност за развитие на региона по поречието на река Дунав и Добруджа в страната. С включването в Топ 50 препоръчани дестинации на \"Lonely Planet\" за 2024 г., Дунав Ултра се появява на световната travel&adventure карта, предоставяйки нов хоризонт за туристическо развитие в сегмента на регионално и национално ниво. Сред водещите институции и организации, партниращи на маршрута са Фондация Америка за България, Министерство на туризма както и множество общини вкл.: Брегово, Видин, Лом, Козлодуй, Мизия, Оряхово, Долна Митрополия, Гулянци, Никопол, Белене, Свищов, Ценово, Две могили, Иваново, Русе, Главиница, Тутракан, Силистра, Генерал Тошево и Шабла. През 2017 г. маршрутът Дунав Ултра е носител на Голямата награда - Иновация в туризма в Годишните награди на Министерство на туризма на Република България. * Дунавски лимес - изградената логистична военна и гражданска инфраструктура по поречието на река Дунав, очертаваща границата на Римската империя на континента, на североизток.",
                "_ownerId": "1",
                "category": "3",
                "region": "4",
                "_createdOn": 1698753427000,
                "_updatedOn": 1698753427000
            },
            "12318": {
                "title": "Политическа декларация от Коалиция \"Граждани за общината\"",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/0e5833e2ebc4c8103463cce585626b20.webp",
                "article": "Уважаеми читатели, днес на редакционната поща получихме политическа декларация от Коалиция \"Граждани за общината\", публикуваме я без редакторска намеса. ДЕКЛАРАЦИЯ В подкрепа на г-н Ивелин Статев Иванов – кандидат за кмет на Община Силистра - втори тур на Местни избори 2023 г. Изразяваме своята подкрепа за г-н Ивелин Статев Иванов – кандидат за кмет на Община Силистра във втория тур на Местните избори, който ще се проведе на 5 ноември 2023 г. Призоваваме нашите симпатизанти, съмишленици и избиратели да гласуват в подкрепа на г-н Ивелин Статев Иванов– кандидат за кмет на Община Силистра, с номер 7 в интегралната бюлетина. Познаваме г-н Ивелин Статев Иванов като отговорен наш съгражданин, с доказана работа и идеи за доброто на силистренци. Той е почтен човек, на реда и закона – инженер, офицер от Българската армия, дългогодишен ръководител, областен управител и народен представител с принос за Община Силистра. Коалиция „Граждани за Общината“ достойно се представи в Местни избори 2023 г. Благодарение на активните и силни личности от листата с кандидати за общински съветници, на нашата програма за Силистра, на доверието и уважението на нашите съграждани, ние постигнахме много добър резултат и имаме два мандата общински съветници – Димитър Тодоров и Иванка Ташева. Изказваме благодарност към нашите избиратели за постигнатия успех и представителство в местния законодателен орган. Заставаме зад Ивелин Статев, с номер 7, всички заедно! 30 октомври 2023 г.",
                "_ownerId": "1",
                "category": "5",
                "region": "1",
                "_createdOn": 1698766233000,
                "_updatedOn": 1698767063000
            },
            "12319": {
                "title": "Кандидатите за общински съветници от Коалиция \"ЛЕВИЦАТА!\" подкрепят Александър Сабанов за кмет на Силистра",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/1419e2828b261e2363bc85c16c7dd36a.webp",
                "article": "Кандидатите за общински съветници от Коалиция \"ЛЕВИЦАТА!\" за Община Силистра обявиха единодушната си подкрепа за независимия кандидат Александър Сабанов за балотажа на 5 ноември в неделя. В тяхната декларация се подчертава решението на Коалиция \"ЛЕВИЦАТА!\" да подкрепи и на втория тур на изборите Александър Сабанов, като най-подходящия кандидат за кмет на Силистра. Този избор е свидетелство за увереността, че Сабанов ще служи на общността независимо от политическите игри и ще работи за благото на всички граждани на общината. \"Александър Сабанов се явява като надежден професионалист с дългогодишен опит в управлението и ясна визия за бъдещето на Силистра\", се казва в декларацията. \"Той е решен да насърчи подобренията в инфраструктурата на общината, включително пътища, тротоари и осветление, както и да подкрепи развитието на икономиката чрез създаване на работни места и привличане на инвестиции.\" Също така, като кмет, Александър Сабанов ще насърчи развитието и надграждането на социалните услуги, като образование, здравеопазване и култура, и ще работи по подобряването на системата за управление на отпадъците и поддържането на чистотата на общината. \"Коалиция \"ЛЕВИЦАТА!\" призовава всички граждани на общината да гласуват с №70 за Александър Сабанов като кмет на Силистра на 5 ноември 2023 г., се казва в декларацията. Подкрепата на Коалиция \"ЛЕВИЦАТА!\" за Александър Сабанов е важен момент в кампанията за балотажа. Тя показва, че Сабанов има широка подкрепа от различни политически сили и от гражданите на Силистра. ",
                "_ownerId": "1",
                "category": "1",
                "region": "7",
                "_createdOn": 1698766556000,
                "_updatedOn": 1698766556000
            },
            "12320": {
                "title": "И Коалиция \"Продължаваме промяната – Демократична България\" подкрепя Александър Сабанов",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/c55273f8559f4d0513ebce7bd617bbc1.webp",
                "article": "От коалиция \"ПП–ДБ\" - Силистра публикуваха преди минути на официалната си Facebook страница декларация, че подкрепят независимият кандидат за кмет на Силистра - Александър Сабанов. В нея се казва: 🟢Ние смятаме, че е време да се промени 12-годишният порочен модел на управление в община Силистра. Затова на предстоящия втори тур на местните избори в неделя подкрепяме независимия кандидат за кмет Александър Сабанов. 🟡Заявяваме, че нашите представители в новоизбрания Общински съвет ще подкрепят всички смислени предложения и остро ще се противопоставят на тези, които не са в интерес на гражданите на общината. ✅Призоваваме всички избиратели да гласуват за промяна на 5 ноември. ",
                "_ownerId": "1",
                "category": "23",
                "region": "7",
                "_createdOn": 1698789932000,
                "_updatedOn": 1698790004000
            },
            "12321": {
                "title": "МИНЧО ЙОРДАНОВ: Честит празник на просветата, книжовността и културата!",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/1440891ba8fd6f2033e9c1ae9473180f.webp",
                "article": "Уважаеми дейци на науката, образованието и културата, Честит празник на просветата, книжовността и културата, напомнящ ни за Българското възраждане и за вечната необходимост от четмо и писмо, от съхраняване на традициите и от вдъхновение в работата. На този ден с преклонение споменаваме имената на дейци в хуманитарната сфера от предишни поколения, защото са оставили следи в народната ни памет. Редом до тях поставяме и съвременните им последователи, защото те заслужават нашето внимание – на институциите и на гражданите, в името на които работят – всеки в избраната от него област. ЧЕСТИТ ПРАЗНИК! МИНЧО ЙОРДАНОВ, областен управител на област Силистра",
                "_ownerId": "1",
                "category": "5",
                "region": "1",
                "_createdOn": 1698836296000,
                "_updatedOn": 1698836296000
            },
            "12322": {
                "title": "Партия \"Български възход\" с подкрепа за Александър Сабанов за кмет на Силистра",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/cec31c00826b3a022b0d1a946a8bdee4.webp",
                "article": "Преди балотажа за кмет в Община Силистра, политическата партия \"Български възход\" официално обяви своята непоколебима подкрепа за независимия кандидат, Александър Сабанов. Решаващото гласуване е насрочено за 5 ноември 2023 г., неделя, и декларацията на партията подчертава тяхната силна вяра в способностите на Сабанов да ръководи Силистра към по-светло бъдеще. Подкрепата се основава на множество причини, които подчертават увереността на партията в квалификациите на Сабанов. Г-н Сабанов се определя като динамичен и предприемчив човек, който е доказал своята стойност в бизнес средата, а също така и в обществената сфера като председател на Общински съвет-Силистра и народен представител. Една от ключовите предизвикателства пред общината е наложителната необходимост от привличане на инвеститори и създаване на работни места, което е важен въпрос и за партията, и за Сабанов. Неговият неугасващ ентусиазъм и иновативен подход го правят идеалния кандидат за да се справи с този проблем. Ключов аспект, който си спечели признание от страна на партия \"Български възход\", е фактът, че Сабанов е независим кандидат. Този статут, партията твърди, ще гарантира прозрачно управление, свободно от влиянието на партийни интереси. Партията отправя апел към всеки гражданин на Община Силистра да изрази подкрепа за Александър Сабанов, като използва бюлетина с номер 70. Този избор е важна стъпка към ефективно управление, икономическо развитие и по-светло и успешно бъдеще за всеки жител на Силистра. ",
                "_ownerId": "1",
                "category": "23",
                "region": "8",
                "_createdOn": 1698836768000,
                "_updatedOn": 1698836971000
            },
            "12323": {
                "title": "Александър Сабанов: Честит празник на всички, приели присърце мисията да бъдат просветители!",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/004129e84d0ffee5932f0965579c2517.webp",
                "article": "Честит да е Денят на Народните будители! Честит да е на всички, за които професията е кауза! Честит празник на родителите, които четат на своите деца, на учителите, които продължават делото им, на писателите и художниците, на всички, които създават изкуство! Честит празник на библиотекари и читалищни дейци, на самодейци и професионални творци! Честит празник на всички, приели присърце мисията да бъдат просветители! Александър Сабанов Независим кандидат за кмет на Община Силистра",
                "_ownerId": "1",
                "category": "3",
                "region": "2",
                "_createdOn": 1698837471000,
                "_updatedOn": 1698837483000
            },
            "12324": {
                "title": "Д-Р ЮЛИЯН НАЙДЕНОВ: Честит празник на хората на духа, словото и действието!",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/96ea1fa9fa29baaeba99c7c3c998556f.webp",
                "article": "Честит празник на хората на духа, словото и действието! Честит празник, будители! Първи ноември далеч не е само празник, той е и символ. Символ на вярата, символ на спомена за миналото, което ще проправи пътя на бъдещето, символ на доброто, което предстои. Бъдете здрави и горди последователи на просветители, поети и писатели, художници и творци, чиито имена споменаваме с признателност! Д-Р ЮЛИЯН НАЙДЕНОВ, кмет на община Силистра",
                "_ownerId": "1",
                "category": "20",
                "region": "7",
                "_createdOn": 1698837908000,
                "_updatedOn": 1698837908000
            },
            "12325": {
                "title": "Политическата партия \"Новото време\": Да изберем Александър Сабанов за кмет на Община Силистра",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/3311c984841c4bf8ed14cc18c8caf99d.webp",
                "article": "Политическата партия \"Новото време\" обявява своята подкрепа за независимия кандидат за кмет на община Силистра, Александър Сабанов, предстоящия балотаж, който ще се проведе на 5 ноември, неделя. В декларацията, партията изтъква, че те вярват, че Александър Сабанов е най-подходящият кандидат за кмет, тъй като разполага с ясна визия относно това как следва да бъде управлявана общината. Един от основните му предимства се свързва с факта, че идва от бизнес средите и разбира как да управлява хора. Партията изразява убеждението, че Александър Сабанов ще бъде успешен кмет, който ще допринесе за процъфтяващата и устойчива бъдеще на Силистра и нейните граждани. Партията прави призив към всички граждани на общината да гласуват в подкрепа на Александър Сабанов, използвайки бюлетина с номер 70, и да го изберат за следващия кмет на Силистра на изборите на 5 ноември 2023 година. Тя вярва, че подкрепата за Сабанов е стъпка към по-добро управление и икономическо развитие на града. ",
                "_ownerId": "1",
                "category": "22",
                "region": "6",
                "_createdOn": 1698838144000,
                "_updatedOn": 1698838144000
            },
            "12326": {
                "title": "Сиромашко лято до 12 ноември, дъжд след това, снегът – в началото на декември",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/a0387158189288ece8457d2cec9c8e6c.webp",
                "article": "По-топло от обичайното ще е времето и през ноември в повечето райони на България. Около климатичната норма ще е само на местата с повече мъгли, а това обикновено са най-ниските части на страната. Валежите през месеца ще бъдат около климатичните норми, като повече дъждове от нормалното се очакват в централните части от Горнотракийската низина и в Родопите. Това съобщи за “24 часа” шефът на синоптичната фирма TV-MET Петър Янков. Средните максимални температури за ноември са между 9 и 14 градуса, а средните минимални - между 1 и 6°. Валежните периоди през месеца са между 3-и и 5-и и от 15 до 18 ноември. По-топлите дни (с температура над 16°) са обикновено през първата половина от месеца. Но ноември ще започне с валежи и захлаждане - на 1-и и 2-и времето ще е динамично с чести превалявания, като през втория ден по-интензивни ще са дъждовете в южните и в източните райони. В планините ще превали мокър сняг. Температурите в населените места ще са от 17 до 22°. От 3 до 5 ноември над страната ще премине нова влажна вълна с дъждове и усилване на вятъра, но пак остава топло. След краткотрайно временно стабилизиране на въздушните маси над Балканския полуостров от 6 до 8 ноември се очакват нови валежи и кратко захлаждане с дневни температури в ниските места от 10 до 17°. В планините над 2000 м ще превали сняг, по-съществено в Стара планина. В края на първата десетдневка и началото на втората - до 12 ноември, сутрините ще са с мъгли в ниските места и по поречията, а през деня ще е слънчево с температури от 14 до 19°. Ще преобладават антициклонални синоптични обстановки. При тях обикновено времето през нощта е ясно, а през деня предимно слънчево. В такива дни слънцето грее, но не топли. Тези периоди са известни като “сиромашко лято”, което според народната метеорология продължава около 30- 40 дни след Димитровден. Облачно и дъждовно ще е от 13 до 15 ноември. Ще се понижат температурите. По планините ще превали дъжд и сняг. От 15 до 23 ноември времето ще бъде слънчево с временни заоблачавания. Утрините ще са хладни, а в котловините - и с намалена видимост. На места в тези райони мъглите или слоестите облаци се задържат през целия ден и максималните температури са значително по-ниски, отколкото в другите части на страната. Очакваните най-ниски температури по високите западни полета и на места в Добруджа са до 3-5°, а дневните ще достигат 10-15°. Нови валежи и слабо понижение на температурите се очаква около 22-26 ноември, като валежите ще бъдат от дъжд, а по планините над 1800 м надморска височина - от мокър сняг.",
                "_ownerId": "1",
                "category": "6",
                "region": "1",
                "_createdOn": 1698838971000,
                "_updatedOn": 1698838980000
            },
            "12327": {
                "title": "Петко Добрев: Да гласуваме и изберем Александър Сабанов за кмет на Община Силистра",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/39047cf3fa17b49ac9386e8d59f8c03a.webp",
                "article": "Късно вечерта вчера, кандидатът за кмет Петко Добрев, издигнат от ПП \"Възраждане\" и класирал се трети, публикува в личния си Facebook профил призив към своите симпатизанти за подкрепа на независимият кандидат за кмет на Силистра - Александър Сабанов на предстоящия балотаж тази неделя. Публикуваме целия пост без редакторска намеса: \"Уважаеми жители на Община Силистра, на 29-ти октомври четирима кандидати за кмет на нашата община застанахме открито пред вас и споделихме своите идеи за смяна на философията на управление за смяна на самата местна власт. Вашия вот посочи като наш лидер г-н Александър Сабанов. На 5 ноември трябва да довършим започнатата работа, масово да излезем, да гласуваме и изберем Александър Сабанов за кмет на Община Силистра.\" Петко Добрев кандидат кмет на Община Силистра от ПП \"Възраждане\" ",
                "_ownerId": "1",
                "category": "6",
                "region": "2",
                "_createdOn": 1698916494000,
                "_updatedOn": 1698916611000
            },
            "12328": {
                "title": "Мая Манолова подкрепи Александър Сабанов и се разграничи от Иванка Ташева",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/f42e7cc4f764b968169aa49af2a48e39.webp",
                "article": "Лидерът на гражданската платформа „Изправи се България“ Мая Манолова призова силистренци да гласуват на балотажа в неделя за независимия кандидат за кмет на общината Александър Сабанов. Тя направи това на брифинг в Националния пресклуб на БТА в Силистра. Според Манолова Сабанов е единственият, който може да се изправи срещу кандидат на ГЕРБ в крайдунавския град и да го победи. „Трябва да сложим край на вечните кметове. Крайно време е в общините, които от години се управляват от ГЕРБ, да влязат кандидати на гражданите, които не са подчинени на една или друга партийна централа. Време е за честно и прозрачно управление, каквото Сабанов може да осъществи. Това означава край на корупционните схеми и на обществените поръчки на тъмно“, каза Манолова. Друга причина, която тя изтъкна, е, че Александър Сабанов обяви намерението си да направи ревизия на предходното управление. Мая Манолова, се разграничи от действията на местната коалиция “Граждани за общината”, представлявана от Иванка Ташева, които подкрепиха за балотажа в неделя кандидата за кмет от ГЕРБ, Ивелин Статев. Манолова заяви, че партията и продължава да подкрепя Александър Сабанов като кандидата, който може да промени модела на управление в Силистра. Партията “Изправи се България” е част от коалицията “Граждани за общината”. Както информира БТА, в кампанията преди първия тур, Мая Манолова заяви подкрепа в Силистра за Александър Сабанов. След първия тур обаче, в декларация, изпратена до \"ПОРТАЛ СИЛИСТРА\", “Граждани за общината” заявиха подкрепа за балотажа за кандидата за кмет от ГЕРБ. ",
                "_ownerId": "1",
                "category": "10",
                "region": "3",
                "_createdOn": 1698928564000,
                "_updatedOn": 1698928564000
            },
            "12329": {
                "title": "Ударна полицейска операция срещу престъпността и изборните нарушения тече в област Силистра",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/751b3378d907e0b2eb8752d1d94687a5.webp",
                "article": "Мащабна специализирана полицейска операция се провежда днес на територията, обслужвана от ОДМВР-Силистра. Тя е насочена към противодействие на престъпленията, свързани с изборното законодателство и политическите права на гражданите, противодействие на конвенционалната престъпност, опазване на обществения ред и подобряване на пътната безопасност. В нея са включени служители на секторите „Противодействие на криминалната престъпност“, „Противодействие на икономическата престъпност“ и „Пътна полиция“ при Областната дирекция, както и служители на Районните управления в Силистра, Дулово и Тутракан. На възлови места на територията на областта са изградени контролно-пропускателни пунктове, на които се извършват проверки на лица и моторни превозни средства. На база изготвен анализ след първия тур на изборите контролната дейност на полицията е насочена към рискови населени места. Обект на контрол са магазини, заложни къщи, пунктове за метали и за дърва, чрез които евентуално може да се осъществи контролиран вот. Активните полицейски действия целят да постигнат и превантивен ефект в рисковите за гласуване населени места. Като превантивна мярка до момента са съставени 64 протокола за предупреждение по ЗМВР. Само през първите три дни на седмицата – от 30.10.2023 г. до 01.11.2023 г., от служители на ОДМВР-Силистра са извършени проверки на 375 моторни превозни средства, 24 места, за които има информация, че в тях се извършва търговия с вот, 13 заложни къщи, магазини и фирми за бързи кредити, 42 лица от активния криминален контингент. Съставени са 22 протокола за предупреждение по чл. 65 от ЗМВР, установени са 3 лица, обявени за общодържавно издирване, 2 лица са задържани, разкрити са 7 престъпления. В периода преди, по време и след провеждане на първия тур на местните избори в ОДМВР-Силистра са отработени 12 сигнала, свързани с изборни нарушения, резултатите от които са докладвани в Районната прокуратура. Образувани са 3 досъдебни производства по чл. 167 – 169 от НК във връзка с нарушения на изборното законодателство. Активните полицейски действия продължават.",
                "_ownerId": "1",
                "category": "20",
                "region": "3",
                "_createdOn": 1698929014000,
                "_updatedOn": 1698929014000
            },
            "12330": {
                "title": "ДПС и още 4 малки партии, коалиции и движения подкрепиха Ивелин Статев",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/4df7bcf2fa070e6f837e5cf88b3d1a4d.webp",
                "article": "Пет политически партии и движения обявиха подкрепата си за кандидата за кмет на община Силистра г-н Ивелин Статев, издигнат от ПП ГЕРБ, за балотажа на 5.11.2023г. С декларации за подкрепа и призив за участие на втория тур в полза на Ивелин Статев излязоха: СДС, ДПС, ПДС, СДП и Граждани за общината. В декларациите си различните политически формации отбелязват, че Ивелин Статев е човекът, на когото може да се повери общината, защото има дългогодишен административен опит, визия за решаване на ежедневните проблеми на хората в града и населените места. Ивелин Статев има изпълнима програма за управление и тя предполага благоденствие за бизнес средата, подобрена инфраструктура, туристическа популярност с ясни цели. КУПУВАНЕТО И ПРОДАВАНЕТО НА ГЛАСОВЕ Е ПРЕСТЪПЛЕНИЕ!",
                "_ownerId": "1",
                "category": "18",
                "region": "1",
                "_createdOn": 1698938363000,
                "_updatedOn": 1698938405000
            },
            "12331": {
                "title": "Проведе се заседание на Областен щаб за изпълнение на Областен план за защита при бедствия и аварии",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/98bd8fd0b1baedb8de5512bcdbbfb74a.webp",
                "article": "В Областна администрация Силистра бе проведено свикано от областния управител Минчо Йорданов разширено заседание на Областен щаб за изпълнение на Областен план за защита при бедствия и аварии, отнасящ се до подготовката за зимен сезон 2023-2024 г. В заседанието участва и заместник областният управител Илиян Великов. Представени бяха кратки варианти на изпратените предварително в Щаба доклади на институциите на регионално ниво, имащи отношение към проблематика, както и на общините от област Силистра. Общото заключение от тях е, че съобразно заповедта на областния управител е извършена необходимата подготовка на екипите, материалната база и техниката. На повечето места са доставени твърди и течни горива в общинските администрации и кметствата, в училища, детски градини и клубове на пенсионери. В някои от общините предстои да бъде завършен процесът с подписване на договори с фирми по снегопочистването на четвъртокласната пътна мрежа и на улиците в населените места. Повечето общини ползват собствено материално осигуряване, като в някои има създадени звена за осъществяване на дейността с техника, собственост на общината. От община Силистра бе изказано уверение, че пред завършване е работата по привеждане в ред на резервния през зимата обходен път за Добрич – Варна. Ръководството на Областна администрация Силистра обърна внимание върху необходимостта всяка институция да следва алгоритъма на действия, разписан в заповедта на министър-председателя, по която е и заповедта на областния управител. Целта е събитията по нейното изпълнение да бъдат в посочената последователност и дейностите по тях да са изразявани по еднакъв начин. Това има отношение към синтеза и анализа на информацията, както и съответно към обратната връзка от страна на институциите при решаване на възникнал проблем, особено при взаимодействие между няколко от тях. Внимание бе насочено и към необходимостта от по-голяма активност от страна на оперативните дежурни в общините при подаване в Областна администрация на стриктни данни за възникнали проблеми, за да бъдат вземани своевременно мерки за тяхното успешно решаване.",
                "_ownerId": "1",
                "category": "19",
                "region": "6",
                "_createdOn": 1698938753000,
                "_updatedOn": 1698938753000
            },
            "12332": {
                "title": "Александър Сабанов: Бъдете смели и решителни, защото заедно можем да направим промяната възможна!",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/dfc9367b145ea0afef2183fab54f8aeb.webp",
                "article": "В последния ден на предизборната кампания, броени часове преди балотажа за кмет на община Силистра, който ще се проведе тази неделя, независимият кандидат за кмет Александър Сабанов отправи видео обръщение към своите приятели и съмишленици. Публикуваме го без редакторска намеса: Уважаеми жители на Община Силистра, Благодаря Ви за подкрепата, с която водим убедително с над 2000 гласа след първия тур на местните избори. Това обаче не трябва да ни успокоява, а работата трябва да продължи до последната минута! Днес получих и подкрепата на коалиция “Продължаваме Промяната - Демократична България“, както и на партия “Възраждане”. Вярваме, че към нашата мисия ще се присъединят всички граждани, сдружения и организации, на които не им е безразлично какво се случва в Община Силистра. Защото сега е моментът за действие! Защото сега е времето да кажем стига! Защото на 5 ноември, неделя, можем да направим промяната възможна. Бъдете смели и решителни, и гласувайте с ума и сърцето си. За мен, Александър Сабанов, с номер 70 за кмет на Община Силистра! ",
                "_ownerId": "1",
                "category": "1",
                "region": "8",
                "_createdOn": 1699021922000,
                "_updatedOn": 1699021922000
            },
            "12333": {
                "title": "Представители на силистренския театър и НЧ „Доростол-1870“ поднесоха цветя пред паметника на възрожденеца Сава Доброплодни",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/c53663708ede412d003bc4f9b363c7df.webp",
                "article": "В навечерието на 1-ви ноември – Деня на народните будители, настоятелството на НЧ „Доростол-1870“, представлявано от неговия председател Маргарита Любомирова и Валентин Копринджийски и Тихомир Лефтеров, съвместно с представители на Драматично-куклен театър-Силистра в лицето на неговия директор Златина Станева, поднесоха цветя пред паметника на възрожденеца Сава Доброплодни в областния град. Сава Хаджиилиев – Доброплодни е сред видните български просветни и културни дейци, които оформят началните прояви на Българското национално възраждане. В Силистра той пребивава като учител от 1870 до 1872 година. В дунавския град създава едно от първите български читалища. Освен това Сава Доброплодни е и родоначалник на театралното дело в Силистра с постановката „Многострадалната Геновева“ през 1870 година, създава първото в България театрално дружество с името „Деятел“. Директорът на Драматично-куклен театър-Силистра Златина Станева и целия екип на Храма на Мелпомена поздравяват всички съвременни български будители – учители, учени, читалищни, музейни и библиотечни дейци, българските творци в областта на изкуствата по случай 1-ви ноември – Деня на народните будители!",
                "_ownerId": "1",
                "category": "8",
                "region": "8",
                "_createdOn": 1699022519000,
                "_updatedOn": 1699022519000
            },
            "12334": {
                "title": "Александър Сабанов пред пълния площад \"Свобода\": Имаме категорична подкрепа за ново начало",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/f39db891b8cf17393ea13803bb26a22b.webp",
                "article": "Тази вечер в Силистра независимият кандидат за кмет на Община Силистра Александър Сабанов закри официално своята кампания преди балотажа на 5 ноември с вдъхновяващ концерт на Деси Добрева и Борис Солтарийски в центъра на крайдунавския град. Силистренци изпълниха докрай площад \"Свобода\", а на сцената излезе Александър Сабанов, който заяви: \"Искам да благодаря първо на политическите партии, които бяха с нас на първи тур. Искам да поканя тук: Стелиян Стойчев, председател на Българската социалистическа партия Венко Начев, Има такъв народ Георги Гайдаров, водач на листата на Алтернативата на гражданите Стоил Стойчев, Левицата Димитър Трендафилов, Български възход Галя Даскалова, НДСВ Стефан Пантелеев, Новото време На втори тур получаваме подкрепата на политическата партия Възраждане. Искам да поканя кандидата им за кмет Петко Добрев. ПП Продължаваме промяната, областният координатор Даниела Костова и общинският ръководител Георги Георгиев, както и представител на Демократична България Стефан Железов, също ни подкрепят. Скъпи приятели, не останаха други партии, които да участват на изборите. Имаме категорична подкрепа. Надявам се в неделя вечер да се поздравим с ново управление на община Силистра. Ново начало за нашата община, една община, която е чиста, приветлива и уютна, една община без политически назначения. Една община, в която хората ще се движат свободно, без да се страхуват, че някой ще ги заплаща за това, че са били на този или на някой друг концерт. В неделя всички вие трябва да излезете и да дадете своя вот. Излезте и гласувайте масово, защото битката не е приключила. Това, че водим с 2000 гласа на първи тур не означава нищо. Балотажът започва от нула. И аз разчитам на всички вас, които излязохте и подкрепихте, на всички тези партии, чиито листи събраха близо 5000 гласа, и на всички тези извън 5-те хиляди гласа на партиите, близо 3500, които подкрепиха отделно мен като кандидат за кмет, защото аз съм инициативен комитет, издигнат от хората, избрани от гражданите на община Силистра, и мисля, че заедно ще променим нашата община и ще работим именно във ваша полза, в полза на гражданите на община Силистра. Очакваме на 5 ноември в неделя да изразите своя вот категорично, както го направихте на първи тур, за да покажем, че това, което се случваше в 12-годишното управление на ГЕРБ, не ни харесва и ние трябва да променим това. С номер 70 в бюлетината за кмет на община Силистра за мен, Александър Сабанов. Благодаря ви, че сте тук. Благодаря, че сме заедно!\" ",
                "_ownerId": "1",
                "category": "11",
                "region": "5",
                "_createdOn": 1699039992000,
                "_updatedOn": 1699040051000
            },
            "12335": {
                "title": "В три общински центъра в Силистренска област се провежда втори тур за избори за кмет",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/be1032d220b638d42d27a698c013c466.webp",
                "article": "В три общински центъра в Силистренска област се провеждат днес избори за кмет – това са Дулово, Тутракан и Силистра. Избори ще има и в още 17 населени места в пет от седемте общини на региона. На провелия се първи тур от местните избори през миналата неделя кметското си място запазиха Любен Сивев в Кайнарджа и Янка Господинова в Алфатар, издигнати от ПП ГЕРБ, и Неждет Джевдет в Главиница и Сезгин Алиибрям в Ситово – от ДПС. В Силистра, Дулово и Тутракан надпреварата днес ще е между настоящите кметове и председателите на общинските съвети - д-р Димитър Стефанов, като независим кандидат, подкрепен от ПП ГЕРБ и Нехат Кантаров от ДПС– в Тутракан, и д-р Юксел Ахмед от ПП ГЕРБ и Невхис Мустафа от ДПС– в Дулово. За поста кмет на Силистра се явяват независимият кандидат за кмет Александър Сабанов и Ивелин Статев, от ПП ГЕРБ. В Дулово и Тутракан кандидатите за кметове са с по 600 гласа разлика на първия тур, а в Силистра Александър Сабанов води с 2000 гласа. Интересен ще е изборния ден за дуловското село Долец, което вчера пострада от смерч и бяха отнесени покривите на голяма част от къщите там. Кандидатите са с два гласа разлика в полза на ДПС срещу ГЕРБ. Машинно ще се гласува в 78 секции в Силистренска община, в 37 – в Тутраканско и в 28 – в Дулово.",
                "_ownerId": "1",
                "category": "20",
                "region": "8",
                "_createdOn": 1699165787000,
                "_updatedOn": 1699165787000
            },
            "12336": {
                "title": "Към 11:00 часа избирателната активност в Община Силистра е 12,22%",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/e3dc9240705e0b51bd9b5a1388634d2d.webp",
                "article": "12,22% е избирателната активност в Община Силистра към 11.00 часа. Гласували са 5283 души от общо 43 233 с право на вот. 15,72% беше избирателната активност в Община Силистра преди една седмица. Гласували тогава бяха 6798 души. От началото на изборния ден в ОИК-Силистра не са постъпили жалби.",
                "_ownerId": "1",
                "category": "23",
                "region": "5",
                "_createdOn": 1699179748000,
                "_updatedOn": 1699179748000
            },
            "12337": {
                "title": "Ниска избирателна активност в Община Тутракан",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/42e527b7e0b4f44d0ad0e7545dcb6c01.webp",
                "article": "Ниска избирателна активност - това е заключението от гласуването към 11:00 часа, съобщава журналиста Калина Грънчарова в личния си Facebook профил. В община Тутракан от 13 025 с право на глас са гласували 1832 или 14,07%. Избира се кмет на община Тутракан и кмет на с. Шуменци. В община Главиница, където се гласува само за кметове на две населени места, резултатът е следният: от 1 323 с право на глас са гласували 225 или 17,1%. В с. Листец са гласували 110 избиратели, в с. Стефан Караджа - 100, а в подвижната секция, която вече приключи работа - 15.",
                "_ownerId": "1",
                "category": "20",
                "region": "4",
                "_createdOn": 1699180062000,
                "_updatedOn": 1699180062000
            },
            "12338": {
                "title": "29,80% е избирателната активност в Община Силистра към 16.00 часа",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/9643928317f91be1353a52b334f8ab83.webp",
                "article": "29,80% е избирателната активност в Община Силистра към 16.00 часа, съобщават от ОИК Силистра. Гласували са 12 887 души от общо 43 233 с право на вот. 33.93% беше избирателната активност в Община Силистра преди една седмица. Гласували тогава бяха 14 670 души. От началото на изборния ден в ОИК-Силистра не са постъпили жалби.",
                "_ownerId": "1",
                "category": "18",
                "region": "5",
                "_createdOn": 1699195399000,
                "_updatedOn": 1699195399000
            },
            "12339": {
                "title": "Рекордна избирателна активност в Дулово, битката за кметския стол е ожесточена",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/e1f2b8edf27fe2b1c847bda89092db66.webp",
                "article": "42,72 % е избирателната активност в Община Дулово към 16.00 часа, която е най-висока за област Силистра за този час. Гласували са 10694 души от общо 25 034 с право на вот. 43.87% беше избирателната активност в Община Дулово преди една седмица. Гласували тогава бяха 10 983 души.. Припомняме, че битката за кметския стол се води между досегашния кмет д-р Юксел Ахмед (ГЕРБ) и инж. Невхис Мустафа (ДПС). От началото на изборния ден в ОИК-Дулово не са постъпили жалби",
                "_ownerId": "1",
                "category": "3",
                "region": "3",
                "_createdOn": 1699197269000,
                "_updatedOn": 1699197269000
            },
            "12340": {
                "title": "Александър Сабанов е новият кмет на Община Силистра",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/82a5f6ab7577cbf779d524d527fe4f2a.webp",
                "article": "Александър Сабанов е новият кмет на Община Силистра. Това съобщиха от предизборния му щаб за медиите. Според паралелното преброяване той води с повече от 1500 гласа на Ивелин Статев, който беше издигнат от ПП ГЕРБ. Очаквайте подробности!",
                "_ownerId": "1",
                "category": "23",
                "region": "7",
                "_createdOn": 1699213438000,
                "_updatedOn": 1699213438000
            },
            "12341": {
                "title": "Невхис Мустафа е новият кмет на Община Дулово",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/7c51134211646e3321cde895c9d1840d.webp",
                "article": "Инж. Невхис Мустафа (ДПС) е новият кмет на Община Дулово. Според паралелното преброяване тя води с повече от около 1000 гласа на д-р Юксел Ахмед, който беше издигнат от ПП ГЕРБ. Народният представител Алтимир Адамов написа следното в личния си Facebook профил: Благодаря на всички,които ни подкрепиха!За съжаление този път загубихме! Успех на новото ръководство на община Дулово! Очаквайте подробности!",
                "_ownerId": "1",
                "category": "18",
                "region": "1",
                "_createdOn": 1699213711000,
                "_updatedOn": 1699213711000
            },
            "12342": {
                "title": "ОФИЦИАЛНО: Невхис Мустафа с убедителна победа в Дулово",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/87edf32406e76164184cd2d01fd2571f.webp",
                "article": "Както по-рано Ви съобщихме, кандидатът на ДПС в община Дулово печели изборите за кметския стол. Според 100% обработени резултати в сайта на ЦИК, Невхис Мустафа печели доверието на 7506 (54.98%) срещу 6034 (44.20%) за досегашния кмет д-р Юксел Ахмед (ГЕРБ). Разликата е точно 1472 гласа в полза на ДПС. Победата е историческа, защото Дулово от началото на демокрацията в България е била под управлението на ДПС с изключение на последните 12 години. ДПС има и мнозинство в общинския съвет, като там ще разполага с 15 съветника.",
                "_ownerId": "1",
                "category": "4",
                "region": "1",
                "_createdOn": 1699227154000,
                "_updatedOn": 1699227154000
            },
            "12343": {
                "title": "ОФИЦИАЛНО: Александър Сабанов с убедителна победа в Силистра",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/5c2100cc11a49f66282ce8330ae23d9c.webp",
                "article": "Според 100% обработени протоколи в сайта на ЦИК независимият кандидат за кмет - Александър Сабанов печели изборите в община Силистра с 2453 гласа разлика. Той печели доверието на 9231 души, а опонента му Ивелин Статев (ГЕРБ) взема останалите 6778 гласа. Избирателната активност на балотажа днес бе 38.57%",
                "_ownerId": "1",
                "category": "20",
                "region": "5",
                "_createdOn": 1699229032000,
                "_updatedOn": 1699229370000
            },
            "12344": {
                "title": "ОФИЦИАЛНО: Димитър Стефанов с убедителна победа в Тутракан",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/06ec5ac3be7a3a5f6ae9baaf762ad39c.webp",
                "article": "Според 100% обработени протоколи в сайта на ЦИК независимият кандидат за кмет - Димитър Стефанов и подкрепен от ГЕРБ печели изборите в община Тутракан с 1540 гласа разлика. Той печели доверието на 3296 души, а опонента му Нехат Кантаров (ДПС) взема останалите 1756 гласа.",
                "_ownerId": "1",
                "category": "6",
                "region": "3",
                "_createdOn": 1699229958000,
                "_updatedOn": 1699229958000
            },
            "12345": {
                "title": "Къде няма да има ток днес в Силистра и региона?",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/d465a25602506ccd0e85452f4f89ebc5.webp",
                "article": "На 07.11.2023 от 08:30 ч. до 17:00 ч., поради извършване на неотложни ремонтни дейности на съоръженията за доставка на електроенергия, ще бъде прекъснато електрозахранването в района на: град Силистра – ул. „Лом“ от №3 до №24, ул. „Старо село“ от №1 до №37. На 07.11.2023 от 14:00 ч. до 16:30 ч., поради извършване на неотложни ремонтни дейности на съоръженията за доставка на електроенергия, ще бъде прекъснато електрозахранването в района на: град Силистра – ул. „Братя Миладинови“ от №24 до №42, ул. „Васил Левски“ от №2 до №31, ул. „Добрич“ №49, ул. „Македония“ от №128 до №171, ул. „Сливница“ от №1 до №5, ул. „Хан Омуртаг“ №8. В периода 07.11.2023 – 10.11.2023 от 08:30 ч. до 17:00 ч., поради извършване на неотложни ремонтни дейности на съоръженията за доставка на електроенергия, ще бъде прекъснато електрозахранването в района на: С. Голеш – ул. „Първа“ и ул. „Втора“. В периода 07.11.2023 – 09.11.2023 от 08:30 ч. до 16:30 ч., поради извършване на неотложни ремонтни дейности на съоръженията за доставка на електроенергия, ще бъде прекъснато електрозахранването в района на: гр. Тутракан – ул. „Родина“, ул. „Никола Обретенов“, ул. „Таню Войвода“, ул. „Катюша“, ул. „Черна“, ул. “Ком“, ул. „Пейо Яворов“. В периода 07.11.2023 – 10.11.2023 от 09:30 ч. до 16:30 ч., поради извършване на неотложни ремонтни дейности на съоръженията за доставка на електроенергия, ще бъде прекъснато електрозахранването в района на: гр. Главиница – ул. „Баба Тонка“, ул. „Витоша“, ул. „Генерал Скобелев“, ул. „Дунав“, ул. „Искър“, ул. “Оборище“, ул. „Розова долина“. В периода 07.11.2023 – 10.11.2023 от 09:30 ч. до 16:30 ч., поради извършване на неотложни ремонтни дейности на съоръженията за доставка на електроенергия, ще бъде прекъснато електрозахранването в района на: с. Нова Черна – ул. „Дунав“, ул. „Кирил и Методий“.",
                "_ownerId": "1",
                "category": "19",
                "region": "8",
                "_createdOn": 1699349804000,
                "_updatedOn": 1699349804000
            },
            "12346": {
                "title": "49 служители на ОДМВР-Силистра са наградени по случай професионалния празник на българската полиция",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/1b295530f0ca6552ecbd3522971abe62.webp",
                "article": "По случай професионалния празник на българската полиция – 8 ноември, Архангеловден, четиридесет и девет служители на ОДМВР-Силистра са наградени с „Писмена похвала“ от областния директор старши комисар Мартин Недялков. За показан висок професионализъм и инициативност при изпълнение на служебните задължения с „Писмена похвала“ е награден началникът на РУ-Дулово главен инспектор Ивелин Иванов. След негово предложение тринадесет служители от полицейския състав на управлението и двама от административния също са отличени за празника. В РУ-Силистра наградени са дванадесет служители от охранителна и криминална полиция. Двама полицаи от униформения и двама от оперативния състав на РУ-Тутракан също получават „Писмена похвала“. С постигнати високи резултати в професионалната дейност повишение в степен на длъжност е заслужил един служител на управлението в Тутракан. С награди за празника са и шестнадесет разследващи полицаи от отдел „Разследване“ при областната дирекция. На 8 ноември – Св. Архангел Михаил, традиционно се отбелязва професионалният празник на българската полиция. Той е честван за първи път през 1924 г., като инициативата за отбелязването му е на софийския градоначалник о.з. подполк. Георги Кисьов. Тогавашният министър на вътрешните работи и народното здраве Иван Русев приема идеята и с одобрението на Софийския митрополит денят на св. Архангел Михаил (21 ноември по стар стил) става празник на полицаите. С решение на Министерския съвет, по предложение на Националния полицейски синдикат, традицията 8 ноември да се чества като професионален празник на българската полиция е възстановена през 1999 г.",
                "_ownerId": "1",
                "category": "10",
                "region": "6",
                "_createdOn": 1699439748000,
                "_updatedOn": 1699439748000
            },
            "12347": {
                "title": "Д-р Юлиян Найденов: Хората от двете страни на Дунав заслужават комфортна връзка",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/5d2f51899e0ebd17c8576673364f5c13.webp",
                "article": "Първият български електрически катамаран, който се строи по поръчка на Община Силистра, бе спуснат на вода преди дни. Съдът следва да бъде предаден на дунавския град до края на годината. Катамарът е с дължина 14 метра и широчина 6 метра, оборудван е с два електрически двигателя и ще може да развива скорост до 13 км\/час. Предвижда се капацитетът му да е 28 пасажери и екипаж от двама души. Кметът на Силистра д-р Юлиян Найденов се качи на кораба и застана зад пулта зад управление. След това той сподели в социалната мрежа: \"Дванадесет години работих по убеждение, че между Силистра и Кълъраш трябва да има пътна връзка. Дунав мост е важен, но е въпрос на междудържавни политики. Корабът, който ще свързва нашите два съседни града, е факт и е благодарение на усилията на местните кметове на Силистра и Кълъраш. Хората от двете страни на река Дунав заслужават тази комфортна връзка и свързаност.\"",
                "_ownerId": "1",
                "category": "6",
                "region": "8",
                "_createdOn": 1699439907000,
                "_updatedOn": 1699439944000
            },
            "12348": {
                "title": "АРХИВИТЕ ГОВОРЯТ: Как д-р Юлиян Найденов (ГЕРБ) започна своя първи мандат?",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/d7718a9a48a1785241806f2749113cff.webp",
                "article": "Едно дежавю получих след като разбрах, че новият кмет Александър Сабанов ще прави финансова ревизия на Общината, пише журналистът Алексей Минев в личния си Фейсбук профил. Същите бяха първите стъпки преди 12 години и на отиващия си кмет д-р Юлиян Найденов. Както се казва - архивите са живи! Д-р Юлиян Найденов представи дефицита и екипа, който ще се бори с него - От 1 януари догодина в Общината ще има нова структура на управление 12 194 988 лева е дефицитът на община Силистра, обяви вчера на първата си пресконференция след изборите кметът на града д-р Юлиян Найденов. Той представи и част от екипа, с който стартира управлението на общината. Другата част от отговорните общинари ще стане ясна по-късно. Кой от тях, обаче ще изкара целия мандат до 2015 г., ще знаем след влизането в сила от 1 януари 2012 г. на новата структура на общинската администрация. Тогава може би пак ще има разместване на пластовете във властовите коридори на Силистра. Градоначалникът предостави на медиите справка със задълженията на местната хазна. Според цифрите, неразплатените задължения на кметството към момента са 7 048 746 лева, поетите ангажименти с неосигурени финансови източници възлизали на 2 706 242 лева. В процес на фактуриране били още 1 940 000 лева, а в ДСК общината имала овърдрафт от 500 000 лева. Така сумата се „закръгля” на 12 194 988 лева. „От неразплатените разходи, 2 400 000 лева са към фирма „Пътперфект“ за дейност през 2009 г. и 1 200 000 лева към фирма „Бургос“ за доставено гориво за отопление“, обяви д-р Юлиян Найденов. Той съобщи още, че през август тази година, със същата фирма бил сключен нов 3-годишен договор за 6 337 094 лева, който влизал в сила от началото на следващата година. „Възложил съм на юристи да проверяват много внимателно този договор“, каза силистренският градоначалник. Тази година за зимни дейности в общината са получени 49 100 лева на два транша, с които предната кметска управа е платила задълженията за предната зима. „За тази зима ще разчитаме основно на местните данъци и приходи“, допълни д-р Юлиян Найденов. Всички детски заведения и училища са заредени с над 169 тона гориво, което щяло да стигне до края на настоящата година. В същото време силистренският кмет обеща, че няма да увеличава данък сгради и таксата за смет. „Изчистваме си задълженията и към двете фирми за чистота, макар и не с големи темпове. Обещах чиста Силистра и всеки може да види, че това вече се прави“, каза д-р Юлиян Найденов. Ситуацията била много сериозна и затова ръководството е предприело мерки, които предвиждат пълен одит, увеличаване на събираемостта на местните данъци и приходи, която в момента е към 30%, и оптимизиране на разходите. Кметът не изключи възможността да накара местни фирми с големи задължения към общинския бюджет да започнат да си плащат и по принудителен начин, според законодателството. Силистренският кмет обяви още, че е останал изненадан от малкия обем на работа и малко усвоените средства през последните години по линия на различните оперативни програми на ЕС, но не пожела да обяви точните параметри. В същото време обаче той декларира, че подготвянето на проекти по линия на оперативните програми значително ще се увеличи, като всички отдели вече работели по задачата. Към момента в цялата общинска администрация на Силистра работят 154 души на делегирани държавни дейности, 284 щата са на заплати от местните приходи, а гражданските договори, по които за тази година са платени 142 000 лева, са 180 на брой, обяви още д-р Юлиян Найденов. Гражданските договори ще бъдат внимателно проверени и „оптимизирани”. ЗА ЕДНА ОТ НАЙ-БОЛНИТЕ ЗА ДОБРУДЖАНЦИ ТЕМИ – ЗАКРИТИЯТ ПРОФЕСИОНАЛЕН ТЕАТЪР, СИЛИСТРЕНСКИЯТ КМЕТ ДЕКЛАРИРА ТВЪРДО, ЧЕ ДО КРАЯ НА МАНДАТА МУ ТЕАТЪРЪТ ОТНОВО ЩЕ ОТВОРИ ВРАТИ, НО КАТО ОБЩИНСКИ. „ТОВА ЩЕ СТАНЕ, КАКВОТО И КОЛКОТО ДА КОСТВА ТОВА КАТО АНГАЖИМЕНТИ И ПАРИ“, ОБЕЩА Д-Р НАЙДЕНОВ. СПОРЕД НЕГО НЕ БИЛО НОРМАЛНО КОГАТО ОБЩИНСКА КУЛТУРНА ИЛИ ДРУГА ИНСТИТУЦИЯ ПОЛЗВА СГРАДАТА, ДА ПЛАЩА НАЕМ НА РЪКОВОДСТВОТО В ДОБРИЧ. Членовете на кметския екип вчера се представиха официално и всички подчертаха, че са приели поканата на д-р Юлиян Найденов да се присъединят, заради доброто бъдеще на Силистра. „До момента никой, никога и по никакъв начин не ми е оказвал давление при сформирането на екипа“, гарантира още д-р Юлиян Найденов. Той съобщи още, че в момента се готви новата структура на общинската администрация, която ще бъде предложена на Общинския съвет и изрази надежда, че тя ще е работеща. Кметът сподели още, че не е особено доволен от състоянието на автопарка на общината, който бил амортизиран, но сега нямало да се харчат излишни пари. Също така той припомни, че залегналата в предизборната му програма точка за възстановяването на общинската полиция ще бъде изпълнена. Хората, на които ще разчита новият кмет - Заместник-кмет „Хуманитарни дейности“ – Денка МИХАЙЛОВА - Заместник-кмет „Устройство на териториите и общинска собственост“ – инж. Ивелин ЛОЗЕВ - Директор на дирекция „Финанси“ – Мирослав КАЛИНОВ - Директор на дирекция „Икономика“ – Николай КОЛЕВ - Началник на дирекция „Връзки с обществеността и международно сътрудничество“ – Мирослава ЧЕРВЕНКОВА",
                "_ownerId": "1",
                "category": "1",
                "region": "8",
                "_createdOn": 1699440737000,
                "_updatedOn": 1699440762000
            },
            "12349": {
                "title": "Ивелин Статев е подал заявление в ОИК, отказва се от мястото си, като общински съветник",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/3e04280fe01bf7ade2755f32531f7334.webp",
                "article": "Кандидатът на ПП ГЕРБ - Ивелин Статев, който загуби балотажа от Александър Сабанов за кмет на община Силистра е подал заявление до ОИК Силистра, че се отказва от мястото си в Общинския съвет. На негово място влиза следващия в листата - инж. Орлин Огнянов. Припомняме, че церемонията по встъпване в длъжност на новоизбрания кмет и общинските съветници ще се състои на 10.11.2023 г. от 10:00 часа в сградата на Общински съвет - Силистра. Публикуваме решението на ОИК без редакторска намеса: РЕШЕНИЕ № 215-МИ Силистра, 08.11.2023 ОТНОСНО: прекратяване на пълномощията на общински съветник от листата на ПП ГЕРБ, поради подаване на оставка В Общинска избирателна комисия Силистра е постъпило заявление от Ивелин Статев Иванов, заведено с вх. № 221-МИ\/ 07.11.2023 г. на ОИК. В заявлението Ивелин Статев Иванов, заявява, че се отказва от правомощията си като общински съветник в Общински съвет Силистра,поради невъзможност да упражнява задълженията си като общински съветник, тъй като същият е народен представител в 49-тото Народно събрание. Ивелин Статев Иванов е обявен за избран за общински съветник с Решение № 169-МИ\/29.10.2019 г. на ОИКСилистра от листата на ГЕРБ и на същия е издадено Удостоверение № 4-МИ\/ 30.10.2023 г. С оглед горното, ОИК Силистра, счита че следва да уважи искането на . Ивелин Статев Иванов от ПП ГЕРБ, като прекрати правомощията му на общински съветник и обяви за избран следващият в листата кандидат. С Решение № 169-МИ\/30.10.2019 г. ОИК Силистра е разпределила броя на мандатите в Общински съвет Силистра, включително и тези на ПП ГЕРБ, като на основание чл.458, ал. 1 от Изборния кодекс (ИК), следващ в листата на ПП ГЕРБ е Орлин Огнянов Николов. С оглед гореизложеното е налице основание за обявяване на избран за общински съветник следващият в листата на ПП ГЕРБ - Орлин Огнянов Николов. на основание чл. 87, ал. 1, т. 24 и чл. 458, ал. 1 от ИК, Общинската избирателна комисия Силистра Р Е Ш И: ПРЕКРАТЯВА пълномощията на Ивелин Статев Иванов с ЕГН ............. като общински съветник в Общински съвет Силистра, издигнат от ПП ГЕРБ и анулира издаденото му Удостоверение № 4-МИ\/ 30.10.2023 г. ОБЯВЯВА за избран за общински съветник в Общински съвет Силистра, следващия в кандидатската листа на ПП ГЕРБ Орлин Огнянов Николов, с ЕГН ……………. и издава удостоверение на същия. Решението подлежи на оспорване по реда на чл. 459 от ИК в 7-дневен срок от обявяването му чрез Общинска избирателна комисия пред Административен съд Силистра. Председател: Марияна Борисова Чобанова Секретар: Севда Мюмюн Хюсеин * Публикувано на 08.11.2023 в 12:55 часа",
                "_ownerId": "1",
                "category": "16",
                "region": "8",
                "_createdOn": 1699443061000,
                "_updatedOn": 1699443110000
            },
            "12350": {
                "title": "Общинските съветници в Тутракан не успяха да си изберат председател",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/560c1810f130cd5c8000e33bbea57a08.webp",
                "article": "Първото заседание на новоизбрания Общински съвет се състоя днес в Тутракан, съобщава БТА. Заседанието беше открито от областния управител на Силистра Минчо Йорданов. Клетва положиха новоизбраните 19 общински съветници, кметът на общината д-р Димитър Стефанов, кметовете на селата Белица, Нова Черна, Преславци, Бреница, Старо село, Шуменци, Варненци, Цар Самуил, Търновци. Деловата част на заседанието беше ръководена от най-възрастния общински съветник – Нехат Кантаров. За нов председател на местния законодателен орган бяха направени четири предложния – Димо Денчев от ПП ГЕРБ, Нехат Кантаров от ДПС, Данаил Николов от „БСП за България“ и Кристиян Калчев от МК „Свобода“. Нито един от тях не успя да събере повече от половината гласове на съветниците. По-късно бе проведен втори тур между получилите най-много гласове Димо Денчев и Нехат Кантаров, но отново никой не събра необходимото мнозинство. Така бе насрочено следващо заседание на 17 ноември, където отново ще бъде проведен избор за председател. Общинският съвет в Тутракан е съставен от пет партии и коалиции. ДПС ще имат най-много съветници – петима. Следват ГЕРБ с четирима, ПП „Социалдемократическа партия“ и местна коалиция „Свобода“ - с по трима, и „БСП за България“ - с двама.",
                "_ownerId": "1",
                "category": "3",
                "region": "5",
                "_createdOn": 1699457889000,
                "_updatedOn": 1699457908000
            },
            "12351": {
                "title": "Общинските съветници и кметовете в Община Ситово положиха клетва",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/c9442fef47ba62c747326625e2edf694.webp",
                "article": "Вчера, 9 ноември 2023 година от 14:00 часа под звуците на химна на Република България, на Европейския съюз и на община Ситово се състоя тържественото първо заседание на новоизбрания Общинския съвет с мандат 2023-2027 година. По традиция събранието бе открито от областния управител - Минчо Йорданов. Дневният ред включваше две точки: 1. полагане на клетва от кмет на Община, кметове на населени места и общински съветници. 2. избор на председател на Общинския съвет. Минчо Йорданов се обърна към членовете на Общинската избирателна комисия (ОИК) и благодари за свършената работа при провеждането на изборите в Община Ситово. Удостоверенията на общинските съветници бях връчени от председателя на ОИК Ситово – Теодора Тодорова. След това своите удостоверения получиха кметът на община Ситово - Сезгин Алиибрям, кметът на кметство Босна – Денис Рюстем, кметът на кметство Гарван – Гинка Макриева, кметът на кметство Добротица – Искра Георгиева, кметът на кметство Искра – Билгин Ниязи, кметът на кметство Любен – Еджевит Шабан, кметът на кметство Попина - Светла Удрева. Областният управител пожела на управляващите ползотворна работа, след което съветниците и новоизбраните кметове се заклеха да служат вярно на своите съграждани.",
                "_ownerId": "1",
                "category": "20",
                "region": "6",
                "_createdOn": 1699633097000,
                "_updatedOn": 1699633097000
            },
            "12352": {
                "title": "Кметът на Oбщина Силистра Александър Сабанов и общинските съветници положиха клетва",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/689c39e9f91a1d962aa86cc8b4dfebd0.webp",
                "article": "Първо заседание на Общински съвет - Силистра за мандат 2023-2027 г. Общинските съветници са представители на 10 партии и коалиции. Стойност на един мандат - 455 гласа. Избран кмет на общината: Александър Сабанов. Избрани кметове на кметства: Айдемир, Калипетрово, Сребърна, Проф. Иширково, Брадвари, Йорданово, Ветрен, Бабук, Смилец, Срацимир. Поздравление от областния управител Минчо Йорданов, който откри заседанието и прочете клетвата. В заседанието участва заместник областният управител Илиян Великов. Резултатите от изборите рпредстави Марияна Чобанова - председател на ОИК Силистра. Изказвания с политически послания от общински съветници от ПП ГЕРБ, Коалиция БСП ЗА БЪЛГАРИЯ, Коалиция ГРАЖДАНИ ЗА ОБЩИНАТА, Коалиция ЛЕВИЦАТА, ПП ВЪЗРАЖДАНЕ и ПП СДС. Приветствие от митрополит Яков - духовен водач на Доростолска епархия. Проведена бе церемония по предаване на ключа на град Силистра като населено място - център на общината, между досегашния кмет д-р Юлиян Найденов на неговия наследник на поста \"еднолична изпълнителна власт\" в лицето на новоизбрания кмет Александър Сабанов, на когото областният управител връчи огърлицата на властта. Предложения да председател на ОбС: д-р Мария Димитрова - ПП ГЕРБ, и Димитър Трендафилов - Коалиция \"Алтернативата на гражданите\". Начин на избор: тайно гласуване. Необходими гласове: 17 от 33 общински съветници, т.е. 50 процента + 1 от общия брой членове на местния законодателен орган. За председател бе избран Димитър Трендафилов с 22 гласа. Заседанието бе водено от доц. д-р Теменужка Богданова-Бухчева - общински съветник с най-дълъг житейски опит. Пред и в сградата на Общинска администрация бе проведен ритуал по посрещане на новия стопанин на община Силистра. Събитието беше предавано онлайн в \"ПОРТАЛ СИЛИСТРА\" и гледано в реално време от над 300 души. Може да видите целия запис по-долу. ",
                "_ownerId": "1",
                "category": "5",
                "region": "6",
                "_createdOn": 1699633685000,
                "_updatedOn": 1699634717000
            },
            "12353": {
                "title": "Кметът на Община Дулово Невхис Мустафа и общинските съветници положиха клетва",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/092bafd3c3a28da144e2f6821a2a2c4a.webp",
                "article": "Първо заседание за мандат 2023-2027 г. на Общински съвет - Дулово, в който са избрани 29 съветници: 15 от ДПС, 11 от ПП ГЕРБ и 3 от Коалиция ЗАЕДНО ДА СИЛНА ОБЩИНА. Кмет: инж. Невхис Мустафа - ПП ДПС. Заседанието откри Минчо Йорданов - областен управител на област Силистра, който по закон прочита клетвата на новоизбраните съветници, кмет на общината и кметове на 25 кметства, както и отправя приветствие от името на държавната власт. Той връчи на новия кмет регалиите на властта. В заседанието участва и заместник областният управител Илиян Великов. Приветствие поднесоха: д-р Джевдет Чакъров - народен представител, и Иво Йорданов - архиерейски наместник в Доростолска епархия към Българска православна църква. Мюсюлманската общност бе представена на заседанието от районния мюфтия Мюддесир Мехмед. Резултатите от изборите докладва Гюнай Незир - председател на ОИК - Дулово. Всички избрани на определена позиция в органите на местните власти положиха подписи в клетвени листи. В частта за избор на председател на ОбС Дулово бе направено едно единствено предложение - за инж. Сезгин Галиб от ПП ДПС, който с 18 гласа бе избран на поста \"пръв сред равни\". След полагането на клетвата заседанието бе водено от общинския съветник Марин Малчев - доайен сред местните народни избраници. Следващото заседание на ОбС Дулово ще бъде на 14 ноември от 11 ч. Събитието беше предавано онлайн в \"ПОРТАЛ СИЛИСТРА\" и гледано в реално време от над 200 души. Може да видите целия запис по-долу. ",
                "_ownerId": "1",
                "category": "16",
                "region": "6",
                "_createdOn": 1699634474000,
                "_updatedOn": 1699634487000
            },
            "12354": {
                "title": "Община Ситово получи нов камион за разделно събиране на отпадъци",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/9a16d108cdbc71ae687677895bcad9c2.webp",
                "article": "Вчера, 9 ноември 2023 г., Община Ситово получи нов камион за разделно събиране на отпадъците. Камионът е закупен със средства от общинския бюджет и е предназначен за събиране и транспортиране на разделно събрани отпадъци от домакинствата. В деня в който се закле за нов мандат кметът на общината Сезгин Алиибрям посрещна новия камион и заяви, че това е важен етап в усилията на общината за повишаване на нивото на разделно събиране на отпадъците. \"Новият камион ще ни помогне да подобрим ефективността на разделното събиране на отпадъците и да намалим количеството на отпадъците, които се изхвърлят на сметищата\", каза Алиибрям. \"Това е важна стъпка към по-чиста и здравословна среда за всички жители на община Ситово.\" Новият камион е оборудван с модерна система за разделно събиране на отпадъци. Той има два контейнера за събиране на хартия, пластмаса, метал и стъкло. Камионът също така има специална система за пресоване на отпадъците, което ще помогне за намаляване на обема им.",
                "_ownerId": "1",
                "category": "4",
                "region": "2",
                "_createdOn": 1699634891000,
                "_updatedOn": 1699634891000
            },
            "12355": {
                "title": "Обявени свободни работни места в област Силистра към 13 ноември 2023 г.",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/cb03de9b17537f5634476f0a91511958.webp",
                "article": "Бюро по труда – Силистра \/общини Силистра, Ситово и Кайнарджа\/ 1 машинен оператор, изделия от хартия, средно образование\/ Производствени технологии 1 заварчик, средно образование\/ Машиностроене, металообработване и металургия 2 логопеди, висше образование\/ Логопедия 1 пълнач, средно образование 1 учител спортна подготовка,висше образование\/ Спорт, треньор по плуване 1учител,общообразователен учебен предмет в прогимназиален етап,висше\/Педагогока на обучението по английски език 1 старши учител,общообразователен учебен предмет в прогимназиален етап,висше\/ Педагогока на обучението по БЕЛ и ФВС 1 учител в група за целодневна организация на учебния ден V-VIIкл. 2 чистачи\/ хигиенисти, средно образование 4 продавач-консултанти, средно образование 1 машинен оператор, изделия от бетон, средно образование; 1 счетоводител, висше образование\/ Икономика; 2 обслужващи работници, промишлено производство, средно образование; 1 медицинска сестра, полувисше образование\/ Медицинска сестра; 1 лекар, висше образование\/ Медицина; 2 шлосери-електрозаварчици, средно образование; 1 машинен оператор, банциг, средно образование; 1 готвач, средно образование; 2 работници, кухня, средно образование; 1 пекар, средно образование; 2 общи работници, промишлеността, средно образование; 3 водачи на мотокари, средно образование; 1 оператор, манипулатор, средно образование; 1 механик, гараж за транспортни средства, средно образование \/Транспортни услуги; 1 автомонтьор, средно образование \/Транспортни услуги; 1 машинен оператор, средно образование; 2 продавачи,закуски и напитки,средно образование; 1 военнослужещ,офицер,висше образование. Бюро по труда – Дулово \/общини Дулово и Алфатар\/ 1 шофьор тежкотоварен автомобил 12 и повече тона (бетоновоз) 1 главен счетоводител – висше образование\/икономика 1 счетоводител (оперативен) – висше образование\/икономика 1 инженер-технолог хранително вкусова промишленост 1 шофьор кат. „С“ – основно образование 2 шивачки - основно образование 1 тракторист – основно образование 2 машинни оператори дървообработване 1 инженер роботика – висше техническо образование 1 шофьор кат. „B“ – основно образование 1 общ работник – начално и\/или основно образование 5 лекари – висше образование “Mедицина” 1 продавач-консултант – средно образование, умения за работа с компютър *Работни места за младежи до 29 години, разкрити по проект BGO5SFPR002-3.001-0001 (”МЛАДЕЖКА ЗАЕТОСТ”+) на Програма „Развитие на човешките ресурси“ 2021-2027 г. в две направления: - За обучение по време на работа 1 сервитьор, средно образование Бюро по труда – Тутракан \/общини Тутракан и Главиница\/ 1 продавач-консултант, средно образование; 1 оператор, производствена линия, средно образование; 3 социални асистенти, средно образование; 2 оператори, производствена линия, основно образование; 3 работници, сглобяване на детайли, средно образование; 1 фелдшер, полувисше образование, степен „Бакалавър”, специалност „Медицина”, ЦСМП; 5 лекари, висше образование, степен „Магистър”, специалност „Медицина”, ЦСМП.",
                "_ownerId": "1",
                "category": "1",
                "region": "8",
                "_createdOn": 1699874632000,
                "_updatedOn": 1699874632000
            },
            "12356": {
                "title": "Утре тестват системата BG-ALERT в Силистренска област",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/7a762af9d3608623a3c8a8f7df3df093.webp",
                "article": "BG-ALERT е нова система, допълваща възможностите на съществуващата Национална система за ранно предупреждение и оповестяване, която ще позволи на компетентните държавни органи да разпространяват предупредителни съобщения до населението, в случай че разполагат с достоверни данни и информация за предстоящи или случващи се бедствия или извънредни ситуации на определена територия. На 15 ноември системата ще бъде тествана на територията на областите Силистра, Велико Търново, Разград и Русе. В часовия диапазон от 12:00 до 12:30 ще бъде излъчвано съобщение, съдържащо текст на български и английски език, и ще бъде разпространявано чрез мрежите на мобилните оператори до устройства, поддържащи технологията Cell Broadcast. Получаването на съобщението на мобилното устройство се очаква да бъде еднократно и съпроводено от специфичен звук и вибрация, дори при активиран тих (безшумен) режим. Съобщението, което ще получат абонатите и на трите мобилни оператори, е с определен надпис в зависимост от версията на операционната система на устройството, а звукът - специфичен, по стандарт, така че да привлече вниманието предвид важността на тези съобщения. В реална ситуация текстовете на съобщенията ще показват нивото на опасност, в какво се изразява тя, ще съдържат също и линк за достъп до страницата www.bg-alert.bg, така че гражданите да получат допълнителна информация. Поетапно ще бъдат извършени тестове във всички 28 области на страната, като на 29 ноември ще бъде проведен национален тест в цялата страна. Системата BG-ALERT няма да уведомява хората при предстоящо земетресение.",
                "_ownerId": "1",
                "category": "19",
                "region": "2",
                "_createdOn": 1699954454000,
                "_updatedOn": 1699954454000
            },
            "12357": {
                "title": "Започва традиционната акция на пътна полиция „Зима“",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/5247e005162ee27ba70dc53f2c06984a.webp",
                "article": "На 15 ноември в Силистренска област, както и в цялата страна, започва традиционната акция на пътна полиция „Зима”. Тя ще продължи до средата на месец декември и ще се проведе в три тематични кампании. Кампания „С безопасно пътно превозно средство през зимата”, за времето от 15 до 24 ноември. Насочена е към водачите на пътни превозни средства - велосипеди, превозни средства с животинска тяга и др. Акцентът е извършване на проверка на светлините за тяхната изправност в съответствие с нормативните изисквания при регистрация и пререгистрация на ППС. Планира се съвместно с органите на местната власт извършването на проверки за наличието на регистрация, както и за изправността на светлоотразителната сигнализация на ППС с животинска тяга и на малогабаритната селскостопанска техника. Проверките в това направление ще продължат и след приключване на акцията. Контролът в този период ще бъде насочен към: Спазването на въведените ограничения за движение на велосипеди, индивидуални електрически превозни средства, ППС с животинска тяга и селскостопанска техника по определени пътища или участъци от републиканската пътна мрежа; Недопускане движение по пътищата и улиците на технически неизправни ППС без необходимото оборудване; Недопускане движението извън населените места, през тъмната част на денонощието и при намалена видимост на велосипедисти без светлоотразителна жилетка; Недопускане движението на водачи на индивидуални електрически превозни средства в тъмните часове на денонощието и\/или при намалена видимост без светлоотразителни елементи върху видимата част на облеклото, позволяващи да бъдат лесно забелязани, или без каска, ако водачите са на възраст до 18 години; Недопускане движението през тъмната част на денонощието на водачи на ППС с животинска тяга без светлоотразителни жилетки. Кампания „Пешеходци, пътници и водачи за толерантност на пътя”, за времето от 25 до 4 декември. Дейността ще бъде насочена към превенция над поведението на пешеходците и пътниците и над водачите, неосигуряващи предимство на пешеходците. Контролът в този период ще бъде насочен към: Спазване от пешеходците на правилата за безопасно пресичане на платното за движение, както и за даване от водачите на ППС на предимство на пешеходците на пешеходните пътеки. Специално внимание ще се обръща на пешеходците в тъмната част на денонощието (при сумрак или на неосветени или слабо осветени участъци) движещи се неправилно, особено извън населените места. Ще се взима отношение спрямо пътници, пътуващи в нарушение на ЗДвП, и които с поведението си създават предпоставки за пътнотранспортни произшествия. За гарантиране безопасността на пешеходците, в т.ч. на организираните групи (деца, възрастни, хора със специални потребности) ще се осъществява контрол за изпълнение на разпоредбите на чл.112, ал.1 и ал.2 от ЗДвП. Чл. 112. (1) Организирана група деца на възраст до 10 години може да се движи само по тротоара или банкета, като първото и последното дете носят светлоотразителна жилетка, и задължително се води най-малко от две лица на възраст над 18 години. При пресичане на платното за движение водачът на групата е длъжен своевременно да подаде сигнал с палка \"Стоп! Деца\", с червен флаг или с ръка, за да спре движението на пътните превозни средства. (2) За осигуряване безопасното пресичане на платното за движение от деца всяко лице на възраст над 18 години може да подаде сигнал с палка \"Стоп! Деца\", с червен флаг или с ръка. С цел правилното прилагане на чл. 112 от ЗДвП е планирано в детските градини и училищата да се проведе превантивна разяснителна кампания „Пресичаме безопасно“. Ще бъде отбелязан и Световният ден за възпоминание на жертвите от ПТП, който тази година е на 19 ноември (неделя). Кампания „Безопасно шофиране през зимата“, за времето от 05 до 14 декември. Тя е насочена към контрол на техническата изправност на автомобилите и на осветителните системи. Контролът в този период ще бъде насочен към недопускане на нарушения на разпоредбите на чл. 70, ал. 3 и на чл. 74, ал. 1 и ал. 2 от ЗДвП: Чл. 70 (3) През деня моторните превозни средства се движат с включени светлини за движение през деня или с къси светлини. Чл. 74. (1) Допълнителни светлини за мъгла може да се използват само при значително намалена видимост поради мъгла, снеговалеж, дъжд или други подобни условия. Тези светлини не може да се използват самостоятелно. (2) Допълнителна задна светлина за мъгла с червен цвят се използва само когато видимостта е намалена под 50 метра. От 01.01.2023 г. до 13.11.2023 г. в Силистренска област са регистрирани 228 пътнотранспортни произшествия, 61 от които тежки. Загинали са 6 граждани, а ранените са 81. През предходния зимен период (01.11.2022 г. – 31.03.2023 г.) в област Силистра са настъпили 105 пътнотранспортни произшествия, 22 от които тежки. Загинал е 1 гражданин, ранените са 29. За същия период за установени нарушения на правилата за движение контролните органи са съставили 1448 акта и 12 810 фиша – близо половината \/5 678\/ от които за нарушения на скоростните режими.",
                "_ownerId": "1",
                "category": "23",
                "region": "3",
                "_createdOn": 1700060638000,
                "_updatedOn": 1700060638000
            },
            "12358": {
                "title": "10 съвета за безопасно пътуване през зимата",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/e5f5cccb9e9959ca91442b192852eb6a.webp",
                "article": "1. Сменете всички течности със зимни. Особено важно е да замените водата с антифриз. 2. Проверете техническата изправност на спирачките, средствата за сигнализация и светлинните източници. 3. Не потегляйте на път, ако отоплителната инсталация и миещото устройство за стъкла са повредени. Подменете перата на чистачките. 4. Поддържайте номерата, стъклата и огледалата за обратно виждане чисти. 5. Проверете състоянието на гумите. От 15 ноември до 1 март автомобилът трябва да е с гуми, предназначени за зимни условия, или с дълбочина на протектора не по-малка или равна на 4 мм. 6. В три- и четириколесните МПС задължително трябва има обезопасителен триъгълник; аптечка; пожарогасител и светлоотразителна жилетка. При необходимост подновете съдържанието на аптечката. 7. Движете се внимателно при намалена видимост, в сумрак или в тъмната част на денонощието, не заслепявайте насрещно движещите се. 8. Ако не сте шофирали през зимата, информирайте се за спецификата на управление при аквапланинг, поледица, снеговалеж и влошени метеорологични условия. 9. В началото на зимата поставете в багажника буксирно въже, вериги за сняг и лопата. Проверете състоянието на резервната гума. 10. При нужда или ако сте в рискова ситуация, позвънете на телефон 112.",
                "_ownerId": "1",
                "category": "5",
                "region": "2",
                "_createdOn": 1700060922000,
                "_updatedOn": 1700060922000
            },
            "12359": {
                "title": "Административният съд в Силистра допусна съдебна експертиза по дело за близо 9 млн. лева",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/3adc9bd8996c864e24e69a09fa3b9442.webp",
                "article": " Административният съд в Силистра допусна съдебна експертиза по дело за оспорване на финансова корекция в размер на 25% от стойността на два договора за инженеринг за реконструкция и доизграждане на ВиК мрежи в Силистра, с. Айдемир и с. Калипетрово, пишат колегите от КВОРУМ. Делото е образувано по жалба на \"Водоснабдяване и канализация\"ООД гр.Силистра срещу Решение от 22.05.2023г. на Ръководителя на Управляващия орган на Оперативна програма \"Околна среда 2014-2020г.\", с което е определена финансова корекция в размер на 25% от стойността на засегнатите от нарушението и признати от УО на ОПОС за допустими за финансиране разходи по обособена позиция 2 – Договор №00513-2020-0007-02\/08.10.2020г., сключен с изпълнител ДЗЗД\"КВ Силистра 2020\" на стойност 18 693 843.66 лева без ДДС и, по обособена позиция 3 - Договор №00513-2020-0007-03\/08.10.2020г. с ДЗЗД\"КВ Силистра 2020\" на стойност 17 116 239.02 лева без ДДС,с предмет:\"Инженеринг за обект:\"Реконструкция и доизграждане на ВиК мрежи в гр.Силистра, с. Айдемир и с. Калипетрово.\" по обособени позиции, с уникален номер 00513-2020-0007\". Общата стойност на финансовата корекция е в размер на 8 952 520,67 лв. Експертизата ще отговори на следните въпроси: 1. Какви инженери за отделните части е предложил в офертата си избраният за изпълнител и има ли предложено лице на длъжност \"експерт проектант по част \"Проектно-сметна документация (ПСД)\"? Каква е неговата роля за организацията на изпълнението на поръчката? 2. В таблица 1 от Техническите предложения за изпълнителя (по ОП-2 и ОП-3) предвидени ли са някакви задължения, дейности или функции за експерта по част \"ПСД\" за изпълнение на поръчката и ако са предвидени - да се посочат конкретно. В същата Таблица №1 посочени ли са взаимовръзките между експерта по част \"ПСД\" с другите експерти? 3. Офертата на избрания за изпълнител съответства ли на правилата на FIDIC и на приложимата нормативна уредба за този вид дейност? 4. Съгласно Документацията за ОП, участникът бил ли е длъжен да представи \"организационна схема\" за изпълнение на поръчката, включваща длъжностите и взаимовръзките между подизпълнителите (ако се предвиждат) и другите участници в строителния процес - възложител, изпълнител, членове в обединението, ръководител на екип, както и с другия ключов персонал? 5. Посочени ли са в организационните схеми към Техническото предложение (и за двете обособени позиции) на изпълнителя, какви функции ще изпълнява подизпълнителя \"Евронет\" ЕООД и взаимовръзките му с другите страни в строителния процес? 6. Съобразявайки Документацията и за двете обособени позиции по процесната обществена поръчка, да даде заключение: - възложителят в каква последователност е предвидил подписването на акт обр.№15, провеждането на 72-часовите проби и подписването на протокол обр.№17 и съответно: - в офертата на изпълнителя в какъв ред (последователност) е предвидено подписването на акт обр.№15, провеждането на 72-часовите проби и подписването на протокол №17. Вещото лице да посочи конкретните документи и страниците от тях, където е разписан въпросният ред. Отговорите на тези въпроси ще бъдат изготвени от вещото лице в срок до 5 декември 2023 г. Съдът насрочи следващо заседание по делото на 13 декември 2023 г.",
                "_ownerId": "1",
                "category": "11",
                "region": "1",
                "_createdOn": 1700061906000,
                "_updatedOn": 1700128827000
            },
            "12360": {
                "title": "Старши полицай Искър Калинов на 60 г.: един живот в редовете на полицията",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/e6b6a0a944b97df3229b651b7569847e.webp",
                "article": "С аплодисменти и ставане на крака на 9 ноември т.г. служителите на РУ-Силистра изслушаха рапорта за регистрираните през изминалото денонощие произшествия, съобщиха от пресцентъра на ОДМВР-Силистра. Прочете го Искър Калинов, до вчера командир на отделение в група „Охрана на обществения ред“, а от днес редови гражданин в цивилното общество след навършване на 60 г. – пределната възраст за работа в МВР. След близо 40 години служба, той вероятно е най-дългогодишният служител в историята на силистренската полиция. Не е потомствен полицай. През далечните 1982 – 83 г. служил в района на Резово, в състава на тогавашните Гранични войски и показал качества, заради които му предложили работа в МВР. Приел и така от 05.01.1984 г. до днес животът му е преминал в редовете на правоохранителните органи. „В полицията се ожених, в полицията се родиха децата ми, пак тук дочаках внуци“, прави равносметка Калинов, за когото живот и кариера се сливат в едно. През годините устоял на множество предложения за преместване в други служби и останал верен на „Охрана на обществения ред“, там, където е бил първият и последният му работен ден. Поколения униформени са се учили от него на служба, имали са го за пример и коректив. Не само заради стажа, а и заради личните си качества Искър се е превърнал в безспорен авторитет и стожер на униформения състав. Определят го като приятел, пример за справедливост, зевзек. Пословичен е с чувството си за хумор и не са една и две лудориите, на които е бил инициатор и основен двигател през годините. Казва, че се иска сърце и душа за успешна кариера в полицията. През годините се е ръководил от принципите за справедливост, честност и лоялност и на тях се стреми да научи младите си колеги. А също и на умението да вземаш решение в екстремна ситуация и то да е адекватно, справедливо и законно. На изпращането му началникът на РУ-Силистра Силистра главен инспектор Траян Петров даде висока оценка за работата на Искър Калинов и му благодари за достойната служба. От името на ръководството на Областната дирекция той му връчи благодарствен адрес и плакет с пожелания за здраве, благополучие и успех в предстоящите начинания. Преди дни уважение към ветерана – полицай с поздравителен адрес и сувенир засвидетелстваха лично областният управител Минчо Йорданов и неговият заместник Илиян Великов на кратка церемония в Областната администрация. А колегите му от „Охрана на обществения ред“ вече планират следващата сбирка на състава. Естествено с Искър, защото без него настроението няма да е същото.",
                "_ownerId": "1",
                "category": "20",
                "region": "7",
                "_createdOn": 1700063024000,
                "_updatedOn": 1700063024000
            },
            "12361": {
                "title": "BILLA отново отвори врати в Силистра",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/0d37697e90c26c531ff8a63a57b7138e.webp",
                "article": "С поздрав на кмета г-н Александър Сабанов и с тържествен църковен ритуал отслужен от ставрофорен иконом Добри Чаков и подаръци за всички служители от изпълнителния директор г-н Вигинтас Шапокас бе открит магазин BILLA ДНЕС, научаваме от Фейсбук страницата на администрацията. По време на тържествената церемония, г-н Александър Сабанов- кмет на община Силистра отправи пожелания за здраве и много клиенти към екипа на магазина, и изрази увереност, че в листата с асортименти на Била ще бъдат включени и ще намерят място на пазара и продукти от местни производители, които са висококачествени. Гости на откриването бяха и председателят на ОбС г-н Димитър Трендафилов и зам.-кметът УТ инженер Тихомир Борачев. Новият модерен магазин в град Силистра е инвестиция от близо 2 млн. лв. С откриването на новия си магазин в Силистра, веригата разкрива 30 нови работни места. Обектът се намира в центъра на града, на бул. „ Симеон Велики“ 25 и е вторият магазин в страната от формата BILLA ДНЕС, с площ от 450 до 600 кв. м. Новата концепция съчетава удобството на квартален магазин с богато разнообразие от свежи продукти на достъпни цени. За по-голямо удобство, клиентите могат да се възползват и от каси на самообслужване, които позволяват по-бързо и лесно маркиране и заплащане на покупките. Магазинът ще посреща клиентите всеки ден от понеделник до неделя от 7:30 до 22:00 часа. ",
                "_ownerId": "1",
                "category": "18",
                "region": "8",
                "_createdOn": 1700130993000,
                "_updatedOn": 1700130993000
            },
            "12362": {
                "title": "Община Ситово ще ремонтира НЧ „Бачо Киро – 1943г.“, в село Искра",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/c184abdf47b27900f69dbe3f3ba8c68f.webp",
                "article": "На 10.11.2023г. кметът на Община Ситово – Сезгин Алиибрям подписа Административен договор №BG06RDNP001-19.159-0013-C01\/10.11.2023г. към проект с наименование: „Ремонт на НЧ „Бачо Киро – 1943г.“, с.Искра, община Ситово“ по Процедура за подбор на проектни предложения BG06RDNP001-19.159 „МИГ Главиница-Ситово Крайдунавска Добруджа“ - подмярка 19.2 „Прилагане на операции в рамките на стратегии за Водено от общностите местно развитие“ на мярка 19 „Водено от общностите местно развитие“ от „Програмата за развитие на селските райони за периода 2014 – 2020 г.“, научаваме от Фейсбук страницата на администрацията. Дейностите заложени по проекта, са: Изпълнение на строително ремонтни работи. Стойността на договора сключен между Държавен Фонд Земеделие, Местна Инициативна Група „МИГ Главиница-Ситово Крайдунавска Добруджа“ и Община Ситово за отпускане на безвъзмездна финансова помощ по Програмата за развитие на селските райони за периода 2014-2020, съфинансирана от Европейския земеделски фонд за развитие на селските райони, по проект № BG06RDNP001-19.159-0013-С01 е на стойност 131 394.82 лв. без ДДС, от които 92 366.58 лв. – МИГ и 39 028.24 лв. – Община Ситово. Крайният срок за изпълнение е 30.06.2025г. Целта на проекта е реконструкция на най-разрушения участък от общинския път SLS 1114 с дължина 850 м. като започва от км. 2+770 и завърши при км. 3+620.",
                "_ownerId": "1",
                "category": "1",
                "region": "4",
                "_createdOn": 1700143552000,
                "_updatedOn": 1700143552000
            },
            "12363": {
                "title": "Камерите на БГ тол вече ще снимат и за превишена скорост",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/5fd941eb8e38711f7a16f37cb7b42234.webp",
                "article": "Камерите на БГ тол вече ще правят снимки и за превишена скорост. Това съобщи Георги Темелков – директор на Националното тол управление. Софтуерът на тол управлението разполага с 50 мобилни, 295 стационарни и 100 претеглени в движение контролни точки, които вече заснемат и превишената скорост. На брифинг днед бе демонстриран начинът на работа на електронната система за събиране на пътни такси. Системата следи продажбите, трафика, задръстванията по граничните пунктове, натоварването на осите на всяко моторно превозно средство и от скоро заснема и превишената скорост. Всички нововъведения се ползват за намаляване на пътния травматизъм, защото всички стационарни точки за контрол правят пълно покритие на пътищата в цялата страна. Снимковият материал, който системата предлага при нарушение за висока скорост на пътя, ще включва четири снимки. „Тестовете показаха, че програмата може да бъде сертифицирана след малки софтуерни промени„, каза още Темелков. Очаква се Българският институт по метеорология да сертифицира софтуера за превишена скорост на НТУ.",
                "_ownerId": "1",
                "category": "22",
                "region": "2",
                "_createdOn": 1700224631000,
                "_updatedOn": 1700227197000
            },
            "12364": {
                "title": "Бурята \"Фредерик \" достига България до часове, не предприемайте пътувания!",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/9299993a0ff4b4df306c4558b747f17a.webp",
                "article": "През следващите 36 часа, времето в Източна България ще се определя от Черноморски циклон. Очакваният център ще премине много близо до Черноморското крайбрежие. Бурята ще генерира силни ветрове с ураганни стойности и високи вълни -до 5-7 метра. Очакваме бурята Frederico (Фредерик )да затвори и пристанищата в района. Бурята ще отмени полети в Истанбул, Варна и Бургас. Висок е и рискът от възможни наводнения и материални щети, следствие от силните пориви на вятъра от над 100 км. \/час и значителните валежи. Синоптичната обстановка до обяд в събота, над Югоизточна и Източна България ще се влошава. Валежите там ще са придружени от силни пориви на вятъра. Ще има условия и за гръмотевични бури. Над Западна и Централна България вятърът ще се ориентира от северозапад и ще се усили, ще започне и понижение на температурите. Валежите над тези райони ще са по-слаби по интензивност. В Източна България ще духа силен северозападен вятър, но с тенденция да се ориентира от север и да се усили до ураганни стойности. Очакваните пориви на вятъра на нос Емине и Калиакра, ще надминат 80 - 120 км. \/час. Силни ветрове се очакват и над района на Сливен, като там вятърът ще се прояви и като Бора. На вр. Ботев поривите на вятъра ще надминат 130 км. \/час. Поради очакваните силни пориви на вятъра над Източна България, през следващите часове се очакват материални щети, като паднали дървета и клони, възможни са и материални щети по сгради и прекъсвания на електрозахранването. Meteo Balkans апелира гражданите да не предприемат пътувания в района!",
                "_ownerId": "1",
                "category": "22",
                "region": "7",
                "_createdOn": 1700319668000,
                "_updatedOn": 1700319843000
            },
            "12365": {
                "title": "Синоптиците този път познаха, първият сняг за този сезон падна в силистренско",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/930db2df6d93601ba711d1964dd95d28.webp",
                "article": "Предпоследният уикенд на ноември ни дава възможност да усетим зимата. Преди около час завaля и първия сняг за тази зима в силистренско. За 13 области е обявен оранжев код за опасно време, като там скоростта на ветровете ще бъде 55-70 км\/ч, а на поривите - между 70 и 100 км\/ч. За особено опасни ветрове трябва да внимават жителите на областите Добрич, Варна, Бургас, Шумен, Силистра, Сливен, Ловеч, Враца, Монтана и Видин. Оранжев код е в сила и за някои общини в областите Търговище, Перник и София-област. В цялата останала страна в сила е жълт код, отново заради вятър със скорост 35-55 км\/ч и пориви до 90 км\/ч. Силният вятър носи риск от летящи във въздуха проблеми, а в областите с оранжев код може да се стигне до изкоренени дървета и аварии по електропреносната мрежа. Ветровете идват със значително понижение на температурите. Максималните температури ще бъдат между 4 и 12 градуса, като най-високи са по Черноморието. За столицата максималната температура в събота е 8 градуса. Очакват се дъждове из цялата страна, които във високите полети ще се обърнат в сняг, макар и по-скоро символичен. Тънка снежна покривка обаче се очаква в Североизточна България. Особено много дъждовни валежи се очакват в нощта на събота срещу неделя. В неделя ситуацията в Западна България ще се успокои, но ветровете ще продължат да вилнеят в източните части на страната. Оранжевият код остава за крайморските области - Варна, Бургас, Добрич, както и Шумен. В останалите области от Източна България - Силистра, Разград, Русе, Търговище, Велико Търново, Сливен, Ямбол и Хасково остава в сила жълт код за силен вятър. Промяната във времето се дължи на обширен циклон, който минава над Черно море.",
                "_ownerId": "1",
                "category": "4",
                "region": "5",
                "_createdOn": 1700325924000,
                "_updatedOn": 1700326135000
            },
            "12366": {
                "title": "Виелицата затвори пътя до Варна през Добрич",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/707804cd21d939a21daa6be16cfec1d5.webp",
                "article": "Добрички регионални медии съобщават, че в момента виелицата е затворила пътя Варна-Добрич въпреки, че се твърдеше, че пътищата са проходими при зимни условия и че АПИ е в пълна готовност. Има автобус, който е препречил пътя в участъка на аксаковските завои, предизвикал е задръстване, което се увеличава. Няма пристигнала пътна помощ, нито снегорин. Участници в движението предупреждават да не се тръгва за и от Варна, защото виелицата се увеличава и пътуването е крайно несигурно.",
                "_ownerId": "1",
                "category": "18",
                "region": "3",
                "_createdOn": 1700331768000,
                "_updatedOn": 1700331939000
            },
            "12367": {
                "title": "Дърво падна край Сребърна, затвори пътя за Русе",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/153b4ebf9dbdb6b92926b14ebc3f0547.webp",
                "article": "За паднало дърво след разклона за село Сребърна съобщават шофьори във Фейсбук групите. Преминаването през участъка е силно затруднено, като по-малките коли едва могат да преминат под самото дърво в едната лента за движение.",
                "_ownerId": "1",
                "category": "16",
                "region": "2",
                "_createdOn": 1700332239000,
                "_updatedOn": 1700332239000
            },
            "12368": {
                "title": "НЕВХИС МУСТАФА: Няма бедстващи по пътищата на територията на община Дулово",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/1fa479431cfc66f0e52e7b39a3488adc.webp",
                "article": "Няма бедстващи по пътищата на територията на община Дулово, съобщи кметът на общината, Невхис Мустафа в своя личен Фейсбук профил. “Поради мокрия сняг има скъсани жици, Енерго Про работят по отстраняване на проблема с енергоподаването. Оставаме на разположение!”, завършва публикацията си тя.",
                "_ownerId": "1",
                "category": "5",
                "region": "7",
                "_createdOn": 1700337978000,
                "_updatedOn": 1700337978000
            },
            "12369": {
                "title": "НА ЖИВО: Борисов е в Дулово за среща с кметовете и общинските съветници от ГЕРБ",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/f7687607b7265f5ab22d10199b48e681.webp",
                "article": "Лидерът на ГЕРБ е в града за среща с кметовете и общинските съветници от партията. Дойдох, за да поздравя нашите хора, които се бориха мъжки и честно на изборите, отбеляза Бойко Борисов. Ако някой трябва да понесе отговорност, трябваше да се иска оставката на премиера Денков, а не министърът на вътрешните работи Калин Стояно. Това заяви лидерът на ГЕРБ Бойко Борисов пред журналисти в Дулово. Той е там за среща с кметовете и общинските съветници от област Силистра. Дойдох, за да поздравя нашите хора, които се бориха мъжки и честно на изборите, отбеляза Борисов. Разговорите започнаха в 14 часа в град Дулово, зала “Добруджа”. \"Разбрахме се с Кирил Петков да намери неутрален вътрешен министър, професионалист. От самия министър разбрахме, че е молен два дни да стане министър. Впоследствие разбрахме, че те ходят в министерството, кадруват, с една-единствена цел, да преследват свои цели\", коментира Борисов по повод исканата оставка на министъра Калин Стоянов заради размириците миналия четвъртък. \"Моля колегите от ПП, ако не са доволни от резултатите от изборите, ако искатда напълнят с калинки МВР... Ако трябваше да се поеме отговорност, трябваше да си отиде Денков. Аз смятам, че категорично не трябва да си ходи Стоянов\", отсече Борисов. Отговарям само за ГЕРБ. Тук, в Дулово, нашите водиха истинска война с ДПС, как не ги е срам, възмути се той от инсинуациите по повод твърденията, че имало коалиция с ДПС. \"Няма да угаждаме на Кирил Петков, дай да сложим и другия му бодигард да стане министър...Сегашният беше бодигард и израстна до зам.-министър. Язък за бензина, който сте похарчили да дойдете до Дулово и да питате това\", обърна се той към медиите. \"От нас ПП няма да срещнат подкрепа нито за ДАНС, нито за МВР. Като изтъквам, че нито Тончев познавам, нито Калин Стоянов. Неистовото желание да се закопчаят службите и да се извършват незаконни арести, вече е опасно%, отсече лидерът на ГЕРБ. По отношение на вота на недоверие Борисов заяви, че е проявил мъдрост и търпение. Поканих Асен Василев, благодаря, че дойде веднага в кабинета ми, каза Борисов. Работиха с Теменужка Петкова, даже и в момента са на среща с Деси Атанасова, Петкова, Пеевски, Данчо Цонев, добави Борисов. \"Защо бензинът днес е с 6 стотинки повече от вчера. Милиарди изтекогха по посока Русия от нашите джобове, от нас, ние сме ги платили. Намерихме и по това компромис, за да може в сряда да се отхвърли вота и да отидем към данъчните закони и бюджета\", каза Борисов. Правя отстъпки, защото сте ми мили вие, хората, изтъкна той. \"Президент можех да стана като бях на 40 години. Тогава, като главен секретар, имах 93 процента рейтинг. Сега искам само ГЕРБ да е стабилизиращият фактор и България да мине през чудовищната криза. За моето его, личната ми кариера, съм направил толкова много, че не може да ме стигне никой\", отсече той. Не знам откъде е дошло това, не пречи да си говорят хората, смята Борисов. Очаквайте подробности ",
                "_ownerId": "1",
                "category": "3",
                "region": "2",
                "_createdOn": 1700482083000,
                "_updatedOn": 1700483637000
            },
            "12370": {
                "title": "Двама са в тутраканския арест за незаконно държане на огромно количество наркотични вещества",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/00eeb3c97f2d4898eb55d7ee6feb20a9.webp",
                "article": "Двама, държали незаконно наркотични вещества, са задържани в ареста след специализирана полицейска операция на служители на РУ-Тутракан. Намерени и иззети са близо 300 грама канабис. Полицейската акция е проведена на 18 ноември с цел противодействие на престъпленията, свързани с наркотици. След предварителна оперативно-издирвателна работа около 18:30 часа криминалистите извършили претърсване на частен дом в село Нова Черна, обитаван от 22-годишен. Там били намерени 71,4 грама суха листна маса, идентифицирана като канабис с полеви наркотест. Два часа по-късно полицейските служители предприели процесуално-следствени действия на друг адрес – частен дом в Тутракан, където били открити 206, 7 грама от същата дрога. Като съпричастен по случая бил установен 23-годишен, обитаващ жилището. Двамата мъже, които до момента нямат регистрирани криминални прояви, са били задържани за срок до 24 часа. Образувани са две досъдебни производства по чл. 354 А, ал. 3 от НК.",
                "_ownerId": "1",
                "category": "17",
                "region": "4",
                "_createdOn": 1700482269000,
                "_updatedOn": 1700482269000
            },
            "12371": {
                "title": "Автоконтрольор Мустафова втора при жените по майсторско управление на автомобил",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/c3c7e0cafa3f9ee21e1b2851c9b26eaf.webp",
                "article": "Мерал Мустафова – автоконтрольор в сектор „Пътна полиция“ при ОДМВР-Силистра, се класира на второ място при жените в дисциплината „Майсторско управление на автомобил“ на XXIX Национален конкурс „Пътен полицай на годината 2023“, проведен в края на миналата седмица в Бургас. В състезанието са участвали 29 отбора с над 70 участници от всички областни дирекции на МВР в страната. Те са мерили умения и знания в дисциплините „Теоретична подготовка“, „Оказване на първа долекарска помощ – теория и практика“, „Стрелба“, „Майсторско управление на автомобил“, „Майсторско управление на мотоциклет“ и „Практичен изпит по оказване на първа долекарска помощ“. В комплексното отборно класиране тимът на ОДМВР-Силистра в състав: Георги Курдов, Петър Петров и Мерал Мустафова са се класирали на 16-то място.",
                "_ownerId": "1",
                "category": "8",
                "region": "7",
                "_createdOn": 1700482590000,
                "_updatedOn": 1700482590000
            },
            "12372": {
                "title": "АЛЕКСАНДЪР САБАНОВ: Честит Ден на християнското семейство!",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/5835012c62a66b7caab91b8f68069a14.webp",
                "article": "Уважаеми жители на община Силистра, Честитя този светъл празник с увереността, че в забързаното ежедневие ценим и знаем колко е важно семейството - нашите баби и дядовци, нашите майки и бащи, роднини и каква отговорност носим пред поколенията - нашите деца. Желая от сърце здраве, любов и хармония в семействата ви! Честит Ден на християнското семейство! АЛЕКСАНДЪР САБАНОВ, кмет на община Силистра",
                "_ownerId": "1",
                "category": "6",
                "region": "4",
                "_createdOn": 1700583633000,
                "_updatedOn": 1700583633000
            },
            "12373": {
                "title": "МИНЧО ЙОРДАНОВ: Честит Ден на християнското семейство!",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/e3798a0f81243276929d6da6ec2b81f0.webp",
                "article": "Поздравявам Ви с празника от религиозния календар на Българската православна църква, който чрез различни форми има своето светско проявление и в живота на нашата страна. Освен в храмовете, както е от векове, през последните години на този ден се отделя все повече внимание в читалища, училища и клубове. Провежданите в тях разнообразни събития акцентират върху семейните ценности и отношенията между хората като важни за съхраняване на традициите в общностите и за укрепване на връзките между поколенията. Честит Ден на християнското семейство! МИНЧО ЙОРДАНОВ, областен управител на област Силистра",
                "_ownerId": "1",
                "category": "16",
                "region": "2",
                "_createdOn": 1700583742000,
                "_updatedOn": 1700583742000
            },
            "12374": {
                "title": "Детето, претърпяло насилие в Силистра, ходело с нож и бокс на училище",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/27e3c4bd4d4bc7459a9e89ea1c8a9d4a.webp",
                "article": "Вчера \"Хоризонт“ съобщи за случай на насилие над дете от негови съученици, който се проверява от Районната прокуратура в Силистра. Той стана обществено достояние след публикация на клип в социалната мрежа. Работи се за изясняване на всички детайли. Срокът на проверката е пет дни. Организиран е т.нар. Координационен механизъм от институции, който също работи по темата, съобщи Ваня Райчева от отдел \"Закрила на детето“ в Силистра. \"Установено е, че в саморазправата са участвали 5 деца. Едно от тях е снимало клип. Децата твърдят, че са били предизвикани от агресивното поведение на Виктор и заплахите, които им е отправил, тъй като е посещавал учебното заведение с нож и бокс. От отдел \"Закрила на детето“ се регистрираха сигнали и за 5-те деца, упражнили насилие. Те ще бъдат насочени към центъра за обществена подкрепа и ще им се осигури индивидуална работа с педагог и психолог. Ще бъдат образувани и възпитателни дела за всички деца, които са проявили агресия\". Родители на деца от Общинското спортно училище в Силистра твърдят, че детето-жертва в клипа, всъщност е агресор. \"Синът ми щеше да пострада сериозно. Виктор и още едно са разглобили колелото му\". \"При нас случаят е с многократни обиди. Виждала съм от страна на майката как го малтретира физически и психически. Не детето е проблем, а майката\". \"Като видя това дете и бягам, защото ме заплашва и казва, че ще ми счупи главата\". Диана Христова е майка на един от главните герои в клиповете - Димитър. \"Синът ми е провокиран от Виктор, който бие дори майка си. Самото дете трябва да е по-далече от майка си\". Даная Димитрова е деветокласничка в същото училище. Тя и нейни съученички са сред свидетелите на поведението на Виктор, който в този случай е потърпевш. \"Дразни се с всички от училището. Брат ми зариди това не искаше да идва на училище. Заплашва го, че ще го пребие и ще му счупи зъбите\". Според Гълъбина Великова ескалацията на напрежението е била очаквана, тъй като в това училище децата са спортисти и със самочувствие. Тя самата е преподавател в гимназиален етап и няма допирна точка със седмокласниците - герои на видеоклиповете, но е имала сблъсък с Виктор. \"Той показа агресия срещу мен. Удари ме отзад. Предупредих го, че не бива. Беше излючителон агресивно и нахално – срещу учител!\" Зам. - директорът на Общинското спортно училище Светла Илиева твърди, че поведението на Виктор е било обсъждано почти всекидневно от учителите. \"Вчера беше свикана Комисията за тормоз в училище. Взехме решение всички ученици да бъдат наказани. Той предизвиква по вербален начин всички останали ученици. Децата нямат толкова висок праг на търпимост, колкото възрастните и са реагирали по този начин\". Според майката на Виктор - Ася Златева – синът й има проблем, който трябва да бъде овладян. Тя не отрича, че той проявява агресия, но е категорична, че ако получи необходимата подкрепа, поведението му може да бъде овладяно, за да не се стига до подобни ситуации. Тя е човекът, който пуска клиповете в социалната мрежа. \"Агресията е много сериозна и към мен. Хората не разбират, че Виктор е дете със специални нужди. Той не получава допълнителна подкрепа. С него не се работи. Многократно съм търсила помощ. Преди година той започна да проявава агресия към мен. Диагнозата му е Синдром на Аспергер. Всички смятат, че Виктор е изключтилено невъзпитан. Често ми се казва, че аз съм виновна. Аз, като родитиел трябва да бъда подрепена, а не заплашвана и упреквана. Много ми е мъчително. Не знам къде да го заведа\". От Отдел закрила на детето заявиха, че всъщност работят с Виктор и майка му от края на миналата година, но и преди това са имали регистрирани сигнали от предишни учебни заведения, в които той е бил. Три месеца е срокът, за да бъде изготвена оценката на момчето за статут на допълнителна подкрепа. А дотогава всички остават в един омагьосан кръг, защото проблемът на едно дете рефлектира върху поведението на останалите.",
                "_ownerId": "1",
                "category": "3",
                "region": "5",
                "_createdOn": 1700583951000,
                "_updatedOn": 1700583951000
            },
            "12375": {
                "title": "Общинският съвет в Тутракан \"върза\" ръцете на кмета",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/23b6c10395d3c66a17b6036c3972f8f4.webp",
                "article": "За 30 ноември е насрочено третото поред заседание на Общинския съвет в Тутракан за избор на председател, след като вече два пъти нито един от номинираните не може да събере нужният брой гласове, научаваме от материал на журналиста Незабравка Кирова за БНР. Едни и същи бяха кандидатите на първото и второто заседание на Общинския съвет, като до втори тур всеки път достигаха Димо Денчев от ПП ГЕРБ и Нехат Кантаров от ДПС, без нужните минимум 9 гласа. Ако и на 30 ноември не се стигне до избор, през седмица - десет дни предстои да бъдат насрочвани заседания на Общинския съвет, заяви кметът на Тутракан д-р Димитър Стефанов. \"Ако до 3 месеца общинският съвет не може да си излъчи и да гласува съответно председател, предстоят нови избори за общински съветници в община Тутракан. Не може да изберем такъв, защото заплатата на председателя е добра. Тук не гледам някой да свърши работата, тук гледаме да се вземе добра заплата\", коментира той. На практика така се блокира работата на Общината, каза още кметът на Тутракан и допълни, че при това положение те ще продължат да работят с една дванайсета от тазгодишния си бюджет. Не може да бъде направена структура на Общината, не могат да кандидатстват и по никакви проекти.",
                "_ownerId": "1",
                "category": "17",
                "region": "7",
                "_createdOn": 1700584515000,
                "_updatedOn": 1700584515000
            },
            "12376": {
                "title": "ИНЖ. НЕВХИС МУСТАФА: Честит Ден на християнското семейство!",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/f5b603d812c5dd9f0a5ad0608706ff3a.webp",
                "article": "Честит Ден на християнското семейство на всички от община Дулово, за които традициите са нещо свещено! От векове по нашите земи връзките между хората по родова линия са в основата на развитието на общността. Споделянето на общо религиозно чувство допълнително засилва този процес. Най-силна обаче е взаимната подкрепа в общуването и добруването. ЧЕСТИТ ПРАЗНИК! инж. НЕВХИС МУСТАФА кмет на Община Дулово",
                "_ownerId": "1",
                "category": "6",
                "region": "6",
                "_createdOn": 1700586281000,
                "_updatedOn": 1700586321000
            },
            "12377": {
                "title": "15 екипа, 5 от които от Силистра ще участват в акселераторa на Академия за местни предприемачи 7.0",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/43270a1a82a5fd4730cb8805d801d52b.webp",
                "article": "Поредният сезон на „Академия за местни предприемачи“ отново ни показа, че популярността на програмата расте и привлича все по-конкурентни и амбициозни идеи. Радва ни фактът, че има толкова предприемчиви хора, които не само търсят лична и професионална реализация в родните си места, но и са мотивирани да подобряват и развиват средата около себе си. За участие в седмото издание на програмата кандидатстваха 46 екипа от регионите на Благоевград, Кърджали, Хасково и Силистра. След първи етап на оценка и обсъждане поканихме 26 от тях на видео интервю с ескперти от Център Ринкър и представители на Филип Морис България. В разговор с кандидатите научихме повече за тях, идеите и целите им. Изборът за прием в акселератора бе труден, тъй като всички се представиха чудесно. Видяхме сериозна мотивация и аргументирана защита на идеи и проекти. Поканихме 15 екипа да се включат в акселераторската програма на Академия за местни предприемачи 7.0. Благодарим за участието на отпадналите на този етап, като им пожелаваме да не се отказват и да се борят за осъществяване на идеите си. Очакваме ги в следващите издания на програмата. Предприемачите и идеите, които продължават напред, са: Салвадор-Асен Бачков и Васил Петров – Optimizee, Силистра Стефани Згурева - Plant Atelier, Кърджали Тонка Николова – Спарта, Кърджали Георги Марков - Foodmark Delivery, Силистра Теодора Йорданова - Luxury catering, с. Окорш Елица Петрова и Даниела Костова - Boho Pro, Силистра Яница Карапенева - HRP-Training, Силистра Антонио Клечеров -AK MUAY THAI GYM, Банско Надя Йовчева – Арт ателие, Димитровград Весела Дончева и Ангелина Дончева - Vaya Handmade Soaps, Хасково Мартин Станоев – ArtUp, Блгоевград Станислава Иванова - Nick's specialty coffee, Благоевград Радост Василева и Димитър Падарев – Спортувай с мен, Гоце Делчев Светлозара Ковачева – резци и форми за сладки, Силистра Джейляна Вранчева и Мустафа Кьосов - Джейля-декорации от скандинавски мъх, Гоце Делчев Обученията ще се провеждат на живо в София, в три последователни уикенда (ноември – декември 2023). Предприемачите ще работят върху бизнес модела си, ще се учат как да маркетират и продават своите продукти и услуги, как да пезентират пред жури и потенциални инвеститори, ще разпишат бизнес план. Експертите от Център Ринкър и външни ментори ще им помогнат да доразвият идеите си, за да представят възможно най-добре потенциала си на Големия финал. Финалът е на 26 януари 2024 г., когато участниците ще защитят разработените бизнес планове пред жури, за да се борят за безвъзмездна финансова награда. Тази година общият награден фонд е увеличен на 35 000 лева, предоставен е от Филип Морис България. „Академия за местни предприемачи“ е обучителна програма, специално създадена за хора с предприемачески идеи, които искат да стартират собствен бизнес. Насочена е към тютюнопроизводителните региони в страната – областите Кърджали, Хасково, Благоевград и Силистра. Осъществява се от Център за предприемачество и обучения „Ринкър“ към Фондация BCause с финансовата подкрепа на „Филип Морис България“ като част от програмата „Забавно лято, грижовна есен 2022“.",
                "_ownerId": "1",
                "category": "23",
                "region": "6",
                "_createdOn": 1700588703000,
                "_updatedOn": 1700588754000
            },
            "12378": {
                "title": "Община Главиница раздаде награди на коректни данъкоплатци",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/317d8b58d18875991af818b656a8393c.webp",
                "article": "Вчера във фоайето на Общински съвет – Главиница се връчиха наградите на печелившите от томбола за коректни данъкоплатци на община Главиница, които са заплатили всички видове данъци и такси за 2023 г. Наградите бяха връчени от Кмета на Община Главиница – Неждет Джевдет. Общинската администрация в Главиница честити на спечелилите предметни награди участници и благодари на всички, които съвестно платиха своите данъци и такси, давайки добър пример на своите съграждани.",
                "_ownerId": "1",
                "category": "21",
                "region": "3",
                "_createdOn": 1700647438000,
                "_updatedOn": 1700647438000
            },
            "12379": {
                "title": "АЛЕКСАНДЪР САБАНОВ: Честит празник на всички български адвокати!",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/1e5c31e4f621a5654496a5944511689a.webp",
                "article": "22 ноември е Денят на българската адвокатура, това ми дава основание да пожелая на всички здраве, професионални успехи в интерес на търсещите защита и справедливост! Вие сте морален стожер в обществото ни! На добър час! АЛЕКСАНДЪР САБАНОВ, кмет на община Силистра",
                "_ownerId": "1",
                "category": "6",
                "region": "1",
                "_createdOn": 1700647657000,
                "_updatedOn": 1700647657000
            },
            "12380": {
                "title": "Времето в силистренско днес ще бъде облачно с превалявания",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/662c9105d1dc4d91706762470b38f807.webp",
                "article": "На 22 ноември 2023 г. на места в страната ще има превалявания от дъжд, а по високите части на планините - от сняг. Над цялата страна ще бъде предимно облачно. През нощта ще е почти тихо. В Северозападна България ще превалява дъжд, докато над останалата част от страната ще е почти без валежи. Минималните температури ще са предимно между 4° и 9°, в София - около 5°. На места в планинските и източните райони от страната ще превали дъжд. Ще духа слаб, в Лудогорието - умерен вятър от североизток. Максималните температури ще са между 9° и 14°, в София - около 10°. В област Силистра се очакват леки превалявания от дъжд, като температурите ще бъдат между 4 и 9 градуса.",
                "_ownerId": "1",
                "category": "19",
                "region": "5",
                "_createdOn": 1700648095000,
                "_updatedOn": 1700648141000
            },
            "12381": {
                "title": "Къде няма да има ток в Силистренско утре?",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/6cef5f0f0d9b22fc433363c1aeced6d5.webp",
                "article": "На 23.11.2023 от 08:30 ч. до 16:30 ч., поради извършване на неотложни ремонтни дейности на съоръженията за доставка на електроенергия, ще бъде прекъснато електрозахранването в района на: село Айдемир – ул. „Ангел Панчев“ от №2 до №58, ул. „Биляна“ от №1 до №9, ул. „Божур“ от №1 до №17, ул. „Бънева чешма“ от №4 до №21, ул. „Волга“ от №1 до №22, ул. „Гайдарче“ от №1 до №25, ул. „Гергана“ от №1 до №32, ул. „Глогинка“ от №1 до №13, ул. „Глухарче“ от №1 до №34, ул. „Детелина“ от №3 до №38, ул. „Дон“ от №1 до 327, ул. „Драгайка“ от №1 до №7, ул. „Затона“ от №2 до №35, ул. „Зелена Морава“ от №2 до №35, ул. „Златна Панега“ от №2 до №5, ул. „Златна Тоня“ от №2 до №32, ул. „Зюмбюл“ от №2 до №13, ул. „Искра“ от 31 до №4, ул. „Катюша“ от №1 до №65, ул. „Китка“ от №1 до №9, ул. „Копрен“ от №1 до №8, ул. „Лозарска“ от №1 до №54, ул. „Мащерка“ от №2 до №13, ул. „Овчарска“ №2 и №3, ул. „Перла“ от №2 до №25, ул. „Полски венец“ №1, ул. „Предел“ от №1 до №11, ул. „Равнец“ от №1 до №31, ул. „Снежанка&ldq uo; от №1 до №8, ул. „София“ от №26 до №247, ул. „Старата липа“ от №4 до №44, ул. „Стария дъб“ от №1 до №28, ул. „Тиса“ №17, ул. „Тополница“ от №2 до №10, ул. „Цветарска“ от №5 до №22, ул. „Чайка“ от №1 до №7, ул. „Чернозем“ от №1 до №26, ул. „Бендер“ №1 и №2, ул. „Бесарабия“ от №1 до №5, ул. „Болград“ №1, ул. „Бряст“ от №1 до №13, ул. „Виделина“ от №3 до №157, ул. „Каменно цвете“ от №1 до №5, ул. „Котел“ №1, №2, ул. „Лале“ от №1 до №25, ул. „Лозарска“ от №4 до №148, ул. „Момчил“ от №1 до №7, ул. „Овчарска“ от №1 до №8, ул. „Патлейна“ от №1 до №12, ул. „Печ“ от №1 до №12, ул. „Полски венец“ от №1 до №8, ул. „Светлина“ от №1 до №33, ул. „Средец“ от №1 до №6, ул. „Тиса“ от №1 до №16, ул. „Търлица“ от №1 до №20, ул. „Хемус“ от №1 до №34, ул. „Цветарска“ от №1 до №10, в района на чешма „Баба Яна“ Айдемир, в района на „Татарица“, в района на „Зелен пазар АД“, в района на манастир „Покров Богородици“. В периода 21.11.2023 – 24.11.2023 от 08:30 ч. до 17:00 ч., поради извършване на неотложни ремонтни дейности на съоръженията за доставка на електроенергия, ще бъде прекъснато електрозахранването в района на: с. Голеш – на ул. „Първа“ и на ул. „Втора“. В периода 20.11.2023 – 24.11.2023 от 08:30 ч. до 17:00 ч., поради извършване на неотложни ремонтни дейности на съоръженията за доставка на електроенергия, ще бъде прекъснато електрозахранването в района на: с. Бабук – на ул. „Дочо Михайлов“ от №10 до №30 и на ул. „Еделвайс“ от №3 до № 21. В периода 20.11.2023 – 24.11.2023 от 08:30 ч. до 16:30 ч., поради извършване на неотложни ремонтни дейности на съоръженията за доставка на електроенергия, ще бъде прекъснато електрозахранването в района на: гр. Тутракан – ул. „Родина“, ул. „Никола Обретенов“, ул. „Таню Войвода“, ул. „Катюша“, ул. „Черна“, ул. “Ком“, ул. „Пейо Яворов“.",
                "_ownerId": "1",
                "category": "17",
                "region": "6",
                "_createdOn": 1700666765000,
                "_updatedOn": 1700667216000
            },
            "12382": {
                "title": "Лоша новина за бъдещите пенсионери, вижте какво им готвят",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/e943cce4881a1363e2e36ac0c4c1796a.webp",
                "article": "Да бъде увеличена възрастта за пенсиониране и да бъдат повишени вноските в частните универсални пенсионни фондове, в които са осигурени работещите хора, родени след края на 1959 г., поиска изпълнителният директор на АИКБ Добрин Иванов, пише Труд бг. Необходимо е пенсионната възраст да бъде повишена, както и да бъде увеличена тежестта на втория стълб на пенсионното осигуряване, защото разходно покривната система ще катастрофира в средносрочен период, заяви той. Добрин Иванов участва на заседание на Националния съвет за тристранно сътрудничество, на който работодателските организации и синдикатите обсъдиха с представители на Министерския съвет проекта на бюджет за 2024 г. Необходима е пенсионна реформа, която да бъде плод на широко обществено обсъждане, каза Добрин Иванов. Не възприемам подход за радикална пенсионна реформа, включително и за параметри като пенсионната възраст, отговори Пламен Димитров, президент на КНСБ. Увеличението на пенсионната възраст няма да остане без реакция, допълни той. В момента Кодексът за социално осигуряване предвижда пенсионната възраст ежегодно да нараства, докато достигне 65 години и за жените и за мъжете. Осигурителните вноски за втория стълб в пенсионната система може да бъдат увеличени, но не за сметка на държавното обществено осигуряване, каза още Пламен Димитров. Работодателите не одобриха вдигането на минималната заплата с близо 20% от 1 януари 2024 г. до 933 лв. Производителността на труда е нараснала само с 1,7%, инфлацията е 5,8%, а това са фактори, които трябва да влияят на минималната заплата, мотивира се Добрин Иванов. Но Любослав Костов от КНСБ заяви, че и в Германия производителността на труда не нараства с повече от 1%, но това не пречи да вдигат значително минималната заплата, защото заплатата играе само малка роля за производителността. Необходима е друга формула за определяне на минималната заплата, заяви още Добрин Иванов. При влизането ни в ЕС бяхме близо до Румъния по икономическо развити, но после изостанахме, коментира министърът на финансите Асен Василев. Спорен него това се дължи на малкото инвестиции. В момента догонваме страните от ЕС с 1-1,5% на година и още 100 години ще ни трябват, за да ги стигнем, каза Асен Василев. А причината за това е липсата на инвестиции. Сред причините за това е, че средата за правене на бизнес е бюрократична, а цената на труда е ниска и компаниите нямат сметка да инвестират, обясни той. За последните три години цената на труда е нараснала с 39%, но въпреки това бизнесът успява да прави инвестиции и да постигне ръст на производителността на труда. Обсъждаме ускорена амортизация при инвестиции в машини, каза още министърът. У нас минималната заплата за следващата година ще бъде 933 лв. А сега в Черна гора е 1042 лв., в Северна Македония е 946 лв., в Сърбия е 1070 лв., а в Румъния е 1296 лв., каза Асен Василев. Според него може да има малко по-голяма гъвкавост при определяне на минималната заплата, но не трябва да се позволява формирането на гета от изостанали райони. А точно това ще се случи, ако се отвори ножицата между минималната и средната заплата. По време на заседанието работодателите подкрепиха предложението за запазване на минималното и максималното дневно обезщетение за безработица през 2024 г. Но от думите на министър Василев стана ясно, че максималното обезщетение може да бъде повишено. 85% отстъпка за лекарства Спор за максималния осигурителен доход Контрол върху парите Търговци на лекарства ги купуват с 85% отстъпка, а здравната каса плаща 100% от цената. Не сме съгласни максималният осигурителен доход (МОД) да нарасне на 3750 лв., каза Добрин Иванов от АИКБ. Според нето е необходим механизъм за определяне на МОД в някакви граници, а изпълнителната власт да взима решение за конкретния му размер. За 2024 г. справедливият размер на максималния осигурителен доход е 3650 лв., каза Добрин Иванов. Според Цветан Симеонов, председател на БТПП, МОД трябва да се определя по формула според инфлацията и средния осигурителен доход и за 2024 г. трябва да е 3566 лв. Вдигане на максималния осигурителен доход заедно с ръста на средния осигурителен доход е добре за хората с високи заплати, коментира Ивайло Иванов, управител на НОИ. Размерът на пенсиите се определя от съотношението на личния осигурителен доход на човек към средния за страната. При осигуряване върху по-висок доход човек ще получи и по-висока пенсия, но за целта трябва да расте и максималната пенсия. Не е нормално човек да пътува 50 км, за да отиде в болница, каза Атанас Кацарчев, главен икономист на КТ “Подкрепа”. Той обясни, че купуват лекарства с 85% отстъпка от цената, а здравната каса покрива 100% от заявената цена на търговците. Така те от самото начало формират печалба от 85%. Затова той поиска по-строг контрол на парите за здравеопазване.",
                "_ownerId": "1",
                "category": "11",
                "region": "1",
                "_createdOn": 1700667626000,
                "_updatedOn": 1700667643000
            },
            "12383": {
                "title": "Областно обучение за безопасност на движението по пътищата на територията на област Силистра",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/2ea5cf0354408ea7a0d88d07f10bbbea.webp",
                "article": "Според заповед на областния управител Минчо Йорданов на 29 ноември 2023 г. в град Силистра ще бъде проведено Областно обучение за безопасност на движението по пътищата на територията на област Силистра. За това съобщиха от пресцентъра на Областна администрация-Силистра. То е по съвместен план на Регионална дирекция „Пожарна безопасност и за защита на населението“ и на специализирания сектор в Областна администрация Силистра. Темата е „Пътен инцидент с участието на тежкотоварен автомобил, превозващ товар и пътнически автомобил, с голям брой пострадали“. Учението ще е на територията на парк „Орехова гора“ от табелата за вход за Силистра до кръстовището след изхода от парка в посока село Калипетрово на главен път Силистра – Шумен. За целта тази отсечка ще бъде затворена за движение на превозни средства от 12.00 до 16.00 ч. на 29 ноември 2023 г. ",
                "_ownerId": "1",
                "category": "16",
                "region": "1",
                "_createdOn": 1700668404000,
                "_updatedOn": 1700668404000
            },
            "12384": {
                "title": "Ден на християнското семейство и в село Стефан Караджа",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/3eac9d2ee2042bf0c6317f148f4b68f2.webp",
                "article": "Народно читалище \"Просвета\" - село Стефан Караджа: \"С музика и веселие отбелязахме 21 ноември - Ден на християнското семейство. На мероприятието присъства кметът на селото Неждет Мехмед, който поздрави присъстващите с празника, като им пожела здраве, благополучие, мир, любов и разбирателство във всяко семейство\".",
                "_ownerId": "1",
                "category": "22",
                "region": "4",
                "_createdOn": 1700668937000,
                "_updatedOn": 1700742069000
            },
            "12385": {
                "title": "Силистренски спортен талант отличен на университетските награди в София",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/1454d37aac46649945d7cfab8aadf5bb.webp",
                "article": "За поредна година Департаментът по спорт на Софийския университет „Св. Климент Охридски“ награди най-добрите студенти-спортисти на Алма матер за 2023 г. Церемонията се проведе в Централното фоайе в Ректората в присъствието на представители на ректорското ръководство, декани, преподаватели, студенти и гости. Сред наградените е и Емма Кърова от Силистра. Тя е част от Стопански факултет, със спорт баскетбол, с треньор проф. Ирен Пелтекова. 1 м. баскетбол 3х3 (Смесени отбори), НУШ; 3 м. баскетбол – Държавно студентско първенство за 2023. Наградата бе връчена от проф. Красимир Петков от НСА. В Силистра се е състезавала за БК „Доростол“ с треньор Росица Тодорова.",
                "_ownerId": "1",
                "category": "21",
                "region": "2",
                "_createdOn": 1700732412000,
                "_updatedOn": 1700732412000
            },
            "12386": {
                "title": "Какво ще бъде времето днес в Силистра?",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/0640c9dc15480d04bcad0e68b6f2f368.webp",
                "article": "През нощта бе облачно, на места с валежи от дъжд.. Минималните температури са между 4° и 9°. Днес ще остане предимно облачно, на отделни места – със слаби валежи от дъжд. Вятърът още сутринта ще отслабне. Преобладаващите максимални температури ще са между 7° и 12°. На територията на област Силистра днес времето ще е облачно. Минималните температури ще са около 2-3°С, а максималните няма да претърпят особена разлика – до 7°С. Вятърът ще е слаб, от югозапад. Валежи днес са вероятни на някои места.",
                "_ownerId": "1",
                "category": "3",
                "region": "8",
                "_createdOn": 1700733099000,
                "_updatedOn": 1700733099000
            },
            "12387": {
                "title": "Силистра стимулира кариерното развитие на студентите си с иновативен тренинг на тема \"Умения за планиране на кариерата“",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/360ae9331efae6b68241c342276ff8bb.webp",
                "article": "В две ателиета премина тренингът със студенти, който Стела Павлова – кариерен консултант подготви и реализира. Събитието предостави възможност на присъстващите студенти от трети и четвърти курс в РУ „Ангел Кънчев“ – филиал Силистра да работят в посока усвояване и надграждане на умения за планиране на кариерата – да усетят себе си като бъдещ професионалист, да осъзнаят тяхната мотивация за работа в сферата на образованието, как и защо персоналният стил на личността има отношение на начина, по който вършим дейностите в работна среда, както и получиха информация в пълнота за това какво съдържа една професионална характеристика на педагога и какво ще се изисква от тях в бъдеще. Вторият панел даде заявката за това как и защо избираме дадена професионална среда като своя чрез балансовия модел на житейските роли и ценностите, които ни водят в професионално отношение. Бяха дадени актуални насоки за начина на подготовка за CV в съвременен вариант и как следва да се подготвим и държим по време на интервю за работа за позицията „учител“ и не само. Много практически моменти и свобода на споделяне съпътстваха целия работен процес, който своевременно се превърна в обмяна на опит, мнения, притеснения от новото в професионалното поле на бъдещите педагози, но в крайна сметка стана ясно, че балансът на това да търсим такава работа среда, която да отговаря на нашите потребности, умения и ценностна система, винаги би довел до добри професионални резултати. Център за кариерно ориентиране изказва благодарности на доц. д-р Румяна Лебедова – директор на филиал Силистра за съвместната организация и възможността за популяризиране на дейността на ЦКО – Силистра сред студентите в нашия град.",
                "_ownerId": "1",
                "category": "11",
                "region": "6",
                "_createdOn": 1700733578000,
                "_updatedOn": 1700733578000
            },
            "12388": {
                "title": "Силистра събира експерти за обмен на добри практики в детските градини",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/955d297695ed05200ad4ca0473639e83.webp",
                "article": "На 24. 11. 2023 г. (петък) РУО – Силистра е домакин на регионален форум „Добри практики в съвременната детска градина – възможности, вдъхновение, въображение“, финансиран от Министерството на образованието и науката по Национална програма „Хубаво е в детската градина“. Форумът ще се проведе в хотел „Дръстър“, Силистра и ще бъде открит в 9. 30 от началника на РУО. Идеята ежегодният областен форум да прерасне в регионален е продиктувана от потребността за взаимна подкрепа и обмен на информация, опит и постижения между педагозите от детските градини в областите Русе, Силистра и Разград. Форумът е насочен към подкрепа на прилагането и популяризирането на добри практики, с които се цели повишаване качеството на предучилищното образование. Участници са учители и директори от детските градини от областите Русе, Силистра и Разград, експерти от регионалните управления на образованието – до 60 човека.",
                "_ownerId": "1",
                "category": "5",
                "region": "8",
                "_createdOn": 1700733955000,
                "_updatedOn": 1700733955000
            },
            "12389": {
                "title": "Пореден случай на агресия срещу ученик със специални потребности в Силистра",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/d0bba876aa54933d1e8ec4d110fb990c.webp",
                "article": " За пореден случай на насилие между ученици, документирано с видео от телефон, съобщава NOVA ТВ. Участниците са 13-годишни момчета от спортното училище в Силистра. Клиповете в социалните мрежи разпространи майката на тормозеното момче, което по нейни думи е със синдром на аспергер и хиперактивност. Тя твърди, че това не е първи случай на вербална и физическа агресия към нейния син. Родители на другите участници обаче казват, че техните деца били обиждани от момчето. Майката на пострадалото в клипа момче каза, че е входирала жалба в училището, че е нападнат, последният случай на агресия срещу него е от петък. Заместник-директорът на спортното училище каза, че за клиповете е разбрала в неделя, като не са били потърсени от майката на потърпевшото момче. Свикана е комисия, която е взела решение за предупреждение за преместване в друго училище на агресивните ученици, което трябва да бъде одобрено от педагогическия съвет. Социалната служба в Силистра е сезирала прокуратурата за случая, извършва се проверка, която ще продължи в рамките на 5 дни. Наблюдаващият прокурор е разпоредил да бъде установена самоличността на всички участници в случилото се и да им бъдат снети обяснения. В хода на проверката трябва да се установят и очевидци на деянието, предава БТА. Организиран е координационен механизъм от Агенция „Социално подпомагане“, отдел „Закрила на детето“, с участието на прокурор, който също работи по темата.",
                "_ownerId": "1",
                "category": "8",
                "region": "3",
                "_createdOn": 1700740824000,
                "_updatedOn": 1700740824000
            },
            "12390": {
                "title": "Немски изтребители ще пазят небето над Силистра",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/9acba2c1c9347393d9eb8f60f1cd527e.webp",
                "article": "Четири изтребителя Юрофайтър от Германия пристигнаха в Румъния вчера, за да подкрепят мисията за наблюдение на въздушното пространство в края на ноември, предаде Аджерпрес \"Германия оказва подкрепа на своя съюзник в НАТО Румъния в наблюдението на въздушното пространство като част от мисията за засилена охрана на въздушното пространство Air Policing South (eAPS). Така вчера следобед (сряда - бел. ред.) изтребители Юрофайтър на германските военновъздушни сили пристигнаха във военната база \"Михаил Когълничану\" край Констанца, която се намира на 100 км от Силистра. През изминалите седмици вече бяха осъществени мащабни подготвителни дейности за разполагането на германския контингент, състоящ се от общо 150 военнослужещи\", се посочва в съобщение на германското посолство, изпратено до Аджерпрес. Според източника от 27 ноември четирите изтребителя Юрофайтър ще влязат в експлоатация и ще подсилят въздушната отбрана на югоизточния фланг на НАТО. Преди това ще бъде извършено сертифициране от страна на НАТО. \"Сърдечно приветствам членовете на германския контингент за интервенция в Румъния. С новото си участие в подсилената мисия Air Policing South с четири изтребителя Юрофайтър ние показваме, че подкрепяме нашия съюзник Румъния и работим заедно, за да обезпечим сигурността на съюзническата ни територия. Благодаря на нашите румънски партньори за гостоприемството и отличното сътрудничество\", заяви посланикът на Германия в Румъния Пеер Гебауер, цитиран в изявлението. Историческа справка: През юни 1942 германският генерал Алфред Герстенберг, командир на Луфтвафе в Румъния, изгражда една от най-силните, ефективни и добре интегрирани системи за ПВО около нефтените полета на Плоещ. В допълнение, въздушният команден център на Луфтвафе разполага с три изтребителни авиополка в Румъния и Западна Украйна с боен радиус до Плоещ. Според съюзническото разузнаване рафинериите са отбранявани от части на румънската армия и ВВС, като се предполага, че противовъздушните оръдия са около 100 и половината от тях са обслужвани от германски разчети. Изтребителната авиация възлиза на 250 – 300 машини, от които 52 немски Me-109G​",
                "_ownerId": "1",
                "category": "4",
                "region": "3",
                "_createdOn": 1700743581000,
                "_updatedOn": 1700743581000
            },
            "12391": {
                "title": "Родители и ученици изработиха коледни играчки на работилница в ОУ '' Отец Паисий\"",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/045e9db2d5adab96cce84f4c48d1f09a.webp",
                "article": "В Деня на християнското семейство родители и ученици от I клас от ОУ \"Отец Паисий\" в Силистра се включиха в \"Работилница за коледни игрички\". Деца и родители с желание изработиха своите коледни играчки. Част от играчките ще бъдат изложени на Коледния базар в училището. В работилницата децата и родителите изработиха различни видове коледни играчки, включително снежинки, елхички и Дядо Коледа. Те използваха различни материали, като хартия, картон, пластмасови топченца и конци. Инициативата бе организирана от учителите от I клас в ОУ \"Отец Паисий\". Целта на събитието е да насърчи децата и родителите да прекарват повече време заедно и да се забавляват​",
                "_ownerId": "1",
                "category": "4",
                "region": "4",
                "_createdOn": 1700744119000,
                "_updatedOn": 1700744119000
            },
            "12392": {
                "title": "Разчистване на високата растителност в община Ситово",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/1e1af6df6a199dcd9475501cfd964000.webp",
                "article": "Община Ситово уведомява жителите на всички населени места в общината Общинско предприятие „Общински имоти и услуги-2012“ Ситово извършва почистване на високата растителност по уличната мрежа, за да се осигури достъп до всички контейнери за смет и безпрепятствено да се осъществява сметосъбирането и сметоизвозването от новия сметосъбиращ камион, който е с по-голям капацитет.",
                "_ownerId": "1",
                "category": "10",
                "region": "6",
                "_createdOn": 1700744429000,
                "_updatedOn": 1700744429000
            },
            "12394": {
                "title": "Полицейска програма за превенция на наркотиците и противообществените прояви стартира в силистренските училища",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/89c87e94fbd28881a46676ca87873413.webp",
                "article": "\"Работа на полицията в училищата\" - програма, резултат на съвместната работа на Министерството на вътрешните работи и Министерството на здравеопазването. Тя е заложена за изпълнение в Общинската програма за закрила на детето през 2023 година. Основни цели са: превенция на противообществените прояви и превенция на употребата и разпространението на наркотични вещества сред малолетните и непълнолетните. Програмата ще се прилага в средните училища на град Силистра от инспектори на ДПС към РУ на МВР и експерти към ОбСНВ и ПИЦ. Заедно с г-жа И. Мърова - инсп. ДПС работиха с 8 \"в\" и 9 \"а\" клас на ПГСУАУ \"Атанас Буров\" - Силистра.",
                "_ownerId": "1",
                "category": "20",
                "region": "4",
                "_createdOn": 1700746623000,
                "_updatedOn": 1700746623000
            },
            "12398": {
                "title": "Обща инициатива за набиране на средства на Община Силистра и Ученически парламент",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/6c590e16eb373129c4739b0abafdfcdb.webp",
                "article": "Изработване на коледни картички - традиция с кауза С тази инициатива Община Силистра и Ученически парламент се включват в благотворителната кампания за набиране на средства за лечение на Данаил Ивайлов Павлов. ",
                "_ownerId": "1",
                "category": "4",
                "region": "6",
                "_createdOn": 1700747166000,
                "_updatedOn": 1700747166000
            },
            "12399": {
                "title": "Две читалища от Тутраканско с общ Международен кулинарен конкурс „Коледна традиционна вечеря\"",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/e5bb7d45a7bd794cedd6c3e7dffae805.webp",
                "article": " НЧ “Светлина - 1941 г.“ - с. Преславци и НЧ “Искра - 1928 г.“ - с. Цар Самуил организират за четвърти път Международен кулинарен конкурс за снимка с рецепта на “Коледна традиционна вечеря“. Идеята: \"Заедно да запазим и предадем българските традиции от коледната традиционна вечеря, като сготвим по-автентична рецепта и я споделим с всички! За поредна година Ви приветстваме да бъдете посланици на българските традиции, като създадем мост на кулинарното наследство от миналото . Включи се в кулинарния конкурс, покажи ни своята рецепта с автентични български продукти\" ЦЕЛ НА КОНКУРСА: - Да се представи пъстротата на българската кухня и традицията при приготвянето на автентични рецепти. - Да предадем и разпространим автентичното кулинарно наследство на българина. - Да стимулира издирването и съхраняването на автентични рецепти характерни за населените места от различните фолклорни области . - Да популяризира българските кулинарни традиции в страната и извън пределите на България. РЕГЛАМЕНТ ЗА УЧАСТИЕ: За да се включиш в конкурса е необходимо да ни изпратиш автентична рецепта и снимка на поднесено и аранжирано готово ястие (минимум 2MB), което трябва да отговаря на коледната традиция! В конкурса могат да участват всички граждани, културни институции, училища, детски градини и клубове без ограничения на възрастовата граница и без такса за участие. Онлайн конкурсът „Коледна традиционна вечеря“ започна на 22.11.2023 г. и приключва на 27.12.2023 г. в 17.00 ч. Всяка от изпратените снимки с рецепта трябва да бъде придружена от ясно изписани: име и фамилия на участника, възраст, училище\/школа, град\/село, област, точен адрес (улица, номер, блок\/вход и тн.), ръководител\/родител, имейл и телефон за връзка. Вашите предложения може да изпращате на имейл адрес: koleden_konkurs1941@abv.bg. Крайна дата за участие - 27.12.2023 г. в 17.00 ч. След валидиране на правото на участие съгласно критериите на конкурса тричленно жури ще избере 3 (три) рецепти, които най-добре пресъздават концепцията за традиционно българско ястие. ОРГАНИЗАЦИЯ: НЧ “Искра - 1928 г.“ с. Цар Самуил; НЧ “Светлина - 1941 г.“ с. Преславци. Награждаването е с плакет и грамота за 1, 2 и 3 място. Спечелилите участници ще бъдат обявени на 3.01.2024г . във Facebook-страницата на Международен кулинарен конкурс „Коледна традиционна вечеря“п(https:\/\/www.facebook.com\/profile.php?id=100076075936887&locale=bg_BG). Всички, които се включат в конкурса, ще получат по имейл похвални грамоти за участие.",
                "_ownerId": "1",
                "category": "22",
                "region": "2",
                "_createdOn": 1700747631000,
                "_updatedOn": 1700747631000
            },
            "12400": {
                "title": "Туристическия бранш страда за кадри",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/ce07ddf200d2c165cb6ddabf62641bf0.webp",
                "article": "Туристическият бранш изпитва остра нужда от добре квалифицирани кадри, които след завършване на обучение да остават трайно на работа в сектора. Те посочват, че обучението трябва да съответства на нуждите на бизнеса. В парламента са внесени промени в Закона за професионалното образование, които ще бъдат в подкрепа на дуалното обучение. Ще бъде разработен нов списък на професиите за професионално образование, по който ще се осъществява обучение, ще се премине към по-широкопрофилни професии. 16% от учениците, които се обучават с професионално направление, са в сектор туризъм. Основният проблем е, че след завършване на образованието си, голяма част от тях не продължават професионалния си път в този сектор. Нужно е да се помисли как да бъдат спечелени за каузата на туристическата индустрия, подчерта заместник-министърът на образованието Мариета Георгиева на събитие в присъствието на представители от туристическия бизнес. Тя уточни, че дуалната форма на обучение работи повече от 7 години в България. По думите й обаче работодателите не са много добре запознати какво представлява дуалното обучение. През септември е приета стратегическа визия за развитие на дуалното образование в България. В момента предстоят промени в Наредбата за дуално обучение. Целта е да се предотвратят всички констатирани затруднения в последните 6 – 7 години пред нормалното му развитие, посочи Мариета Георгиева. Нужно е да се намери правилната регулация, така че да се подпомогне процесът на задоволяване на нуждите на реалния сектор с добре подготвена работна сила. Ще се търси обсъждане сред максимално широка аудитория, като е нужна активността на бизнеса, подчерта още тя. Предвижда се не само финансиране от Швейцария по проекта \"Домино\", но и адаптиране на швейцарския опит спрямо българските условия. През следващата година ще се осъществи неговия втори етап. Нужни са не само промени в образованието, но и законодателни мерки, казва Желязко Каракашев – преподавател в колеж по туризъм към Икономическия университет във Варна и завършил образованието си в Швейцария. За участие в събитието са поканени български общини със значителен туристически потенциал, представители на туристическия бизнес, екскурзоводи, партньори от водещи висши учебни заведения, официални гости от висшата държавна администрация. В програмата на събитието е предвидено и посещение на емблематични туристически обекти в общината, както и запознаване с новости на туристическия продукт както на Пловдив, така и на други участници​",
                "_ownerId": "1",
                "category": "22",
                "region": "6",
                "_createdOn": 1700748201000,
                "_updatedOn": 1700748201000
            },
            "12401": {
                "title": "В село Коларово организират „Общински преглед на художествената самодейност“",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/d3afa58220e57e12064de4a925386f66.webp",
                "article": "Община Главиница и НЧ „Св. Св. Кирил и Методий – 1942 г.“ организират „Общински преглед на художествената самодейност – 2023“ на 25 ноември 2023 г. \/събота\/ от 9:00 ч. в читалището в село Коларово. Участие ще вземат народните читалища на територията на Община Главиница. ",
                "_ownerId": "1",
                "category": "21",
                "region": "2",
                "_createdOn": 1700748536000,
                "_updatedOn": 1700748536000
            },
            "12402": {
                "title": "Екоклуб \"Пеликан\" се обучава за превенция на зависимости в Превантивен информационен център Силистра",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/59768c0c8fe25d33bcefdfdfec0582ca.webp",
                "article": "Превантивен информационен център Силистра беше домакини на Екоклуб \"Пеликан\" към ЦПЛР - ОДК - гр. Силистра, с ръководител г-жа Ивена Димитрова. Проведената беседа беше с опознавателна цел. Младежите от Екоклуб \"Пеликан\" се запознаха с дейността и функциите, които изпълнява Превантивния информационен център по зависимости. Те научиха за различните видове зависимости, за рисковете, които те крият, и за начините за превенция. В края на беседата участниците споделиха идеи за реализация при следващите си срещи. Те се интересуваха от възможностите за участие в кампании за превенция на зависимостите, както и за организиране на екологични инициативи​​.",
                "_ownerId": "1",
                "category": "17",
                "region": "6",
                "_createdOn": 1700749099000,
                "_updatedOn": 1700749099000
            },
            "12403": {
                "title": "Кампания срещу домашното насилие – да кажем НЕ на страха",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/8e464aaeb1f06c5d985fe0fcb6dc76e2.webp",
                "article": "Sillistra News съобщават: Три организации в Русе, чиято дейност е свързана пряко с подкрепата на жени, жертви на насилие – Сдружение „Център Динамика“, Зонта Интернешънъл – Русе и Сороптимист Интернешънъл – Русе, в партньорство с Областна администрация – Русе, Окръжен съд – Русе, ОД на МВР – Русе и Голдън Феми Филм Фестивал, се обединяват за повече гласност и ефективна превенция срещу домашното насилие и слагат началото на кампания „ДОМАШНОТО НАСИЛИЕ НА ФОКУС – ДА КАЖЕМ НЕ НА СТРАХА“. Тя се провежда в рамките на обявените в световен мащаб 16 дни на активност срещу насилието, основано на пола (25.11. – 10.12. 2023) Кампанията е подкрепена от Русенския университет „Ангел Кънчев“, Българския младежки червен кръст – Русе, Детската театрална школа „Патиланци“, доброволци и граждани. По време на кампанията ще се проведат следните дейности: 11.2023 г. от 11.30 ч. до 13,00 ч. на площад „Свобода“ (пред Съдебната палата) – откриване на кампанията в гр. Русе, разпространение на информационни материали „Разчетете знаците на една токсична връзка, за да избегнете домашно насилие“ и пърформанс с участието на Детска театрална школа „Патиланци“ и доброволци. При неподходящи климатични условия събитието ще се проведе в Русенския университет, зала „Сименс“, 2Г.204 (втори корпус на РУ). 11.2023 г. от 17.30 ч. в Зала 1 на Областна администрация – кръгла маса на тема „Домашното насилие на фокус – да кажем НЕ на страха“ с участието на представители на Окръжен съд – Русе, Окръжна прокуратура – Русе, ОД на МВР – Русе, Адвокатска колегия – Русе и отделение по Съдебна медицина към УМБАЛ „Канев“. Дискусия. Представяне на късометражния филм „Смешния съд“ с Николай Урумов. Филмът повдига болезнения и актуален проблем, свързан с насилието над жените и децата. 12.2023 г. от 18.30 ч. – онлайн среща с Мариела Георгиева – бивш полицай и писател, автор на „Лицата на неродените пеперуди“. Книгата описва реални случаи от дългогодишната й практика като полицай в САЩ и разказва за болката и травмите върху психиката на жени и деца, преживяли домашно насилие. В световен мащаб близо 89 000 жени и момичета са били умишлено убити през 2022 г. Според данни от Службата на ООН по наркотиците и престъпността (UNODC) и ООН Жени (UNWomen), 55% (48 800) от всички убийства на жени са извършени от членове на семейството или интимни партньори, или средно повече от 133 жени или момичета са били убивани всеки ден от някого в собствения им дом. Това подчертава обезпокоителната реалност, че домът далеч не е безопасно убежище за жени и момичета. Насилието срещу жени е повишено и в различни среди, включително работното пространство и онлайн пространствата. Глобално проучване на Economist Intelligence Unit установи, че 38% от жените са имали личен опит с онлайн насилие, а 85% от жените, които прекарват време онлайн, са станали свидетели на дигитално насилие срещу други жени. Глобално проучване на жените, работещи в технологичния сектор, е установило, че 44% от жените основатели в този сектор са били подложени на някаква форма на тормоз на работното място през 2020 г., от които 41% от жените са били подложени на сексуален тормоз. В България до края на август 2023 г. получили заповед за защита от домашно насилие са 2828 пострадали. След отмяна на изискването за системност на актовете на домашно насилие в Наказателния кодекс, се наблюдава 40% ръст на образуваните досъдебни производства за такива престъпления. Това, което мотивира нас и цялото гражданско общество за активност по темата, са данните, говорещи за изостряне на проблема. Според Министерството на вътрешните работи на България, до края на септември 2023 г., убийствата на жени достигат 20. Не можем да останем безучастни при тази статистика. Само заедно и с непримиримост можем да обърнем посоката и да тръгнем към пълното изкореняване на проблема с насилието.",
                "_ownerId": "1",
                "category": "3",
                "region": "2",
                "_createdOn": 1700749495000,
                "_updatedOn": 1700749495000
            },
            "12404": {
                "title": "Силистра е регионът с най-нисък Брутен Вътрешен Продукт",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/2dca390ee6fb45a06a21a86e0a5cc31f.webp",
                "article": "Силистра е регионът с най-нисък БВП на човек от населението в България, според доклада на Института за пазарна икономика за 2023 г. Развитието на пазара на труда и инвестиционната активност в областта са незадоволителни, с предизвикателства като образователната структура и застаряването на работната сила. Силистра също така се отличава със слабо представяне в здравеопазването, демографията и културния живот. Промишлеността в областта е ниска, като селското стопанство остава значим отрасъл. Преките чуждестранни инвестиции са също значително под средното ниво за страната. Силистра се отличава с една от най-слабите демографски картини в България. Учебните постижения в областта са под средните, а здравеопазването е затруднено от недостиг на медицински персонал и легла в болниците. Въпреки че натовареността на съдиите е близка до средната за страната, съдебните процеси протичат бързо. Показателите за околната среда са слаби, но културният живот и посещаемостта на библиотеките се подобряват. Туризмът обаче остава недоразвит. БВП на глава от населението е 10 000 лева, което е с 3 000 лева под средното за страната​",
                "_ownerId": "1",
                "category": "23",
                "region": "8",
                "_createdOn": 1700750067000,
                "_updatedOn": 1700750067000
            },
            "12405": {
                "title": "Нова система за засичане на скоростта внедрена в толсистемите в България",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/4949b8156191997c0af6b6b5d3df8549.webp",
                "article": "Толсистемните камери в България са оборудвани с нов софтуер, позволяващ засичане на скоростта на шофьорите. Камерите, общо 295 на брой, са разположени по главните пътни артерии и са свързани с контролния център на БГ ТОЛ. В рамките на четири месеца се очаква въвеждане на глоби за превишена скорост, засечена от толсистемата. Планират се законодателни промени в Закона за движение по пътищата. Системата, една от най-модерните в Европа, вече е интегрирана с основни държавни институции като МВР, Митниците и НАП, осигурявайки непрекъснат контрол​​.",
                "_ownerId": "1",
                "category": "10",
                "region": "7",
                "_createdOn": 1700750246000,
                "_updatedOn": 1700750246000
            },
            "12406": {
                "title": "\"Езикова гимназия „Пейо Яворов“: Успешно участие в международния конкурс по превод „Juvenes Translatores“ 2023\"",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/5bb8518538e1ee44e9e584ab745bb532.webp",
                "article": "На 23 ноември 2023 г. Езикова гимназия „Пейо Яворов“ взе участие в международния онлайн конкурс по превод „Juvenes Translatores“ към Европейската комисия, Генерална дирекция „Писмени преводи“. ЕГ „Пейо Яворов“ е сред 17-те училища от България, избрани да участват в него, а в ролята на млади преводачи активно се включиха Даниел Русев от 11а клас с превод на текст от френски на български език и Джем Джеват, Ния Атанасова, Ясемин Селим, Селин Неджат от 11 б клас с превод от немски на български език. Учениците трябваше за определено време да преведат и изпратят текстовете си в онлайн платформа на конкурса. Благодарим сърдечно за активното им участие! Сърдечни благодарности и на г-жа Красимира Петрова за съдействието и подкрепата! Списък със селектираните училища от Европейския съюз можете да разгледате на следния линк: https:\/\/commission.europa.eu\/education\/skills-and-qualifications\/develop-your-skills\/language-skills\/juvenes-translatores\/list-selected-schools_bg ",
                "_ownerId": "1",
                "category": "8",
                "region": "3",
                "_createdOn": 1700809430000,
                "_updatedOn": 1700809430000
            },
            "12407": {
                "title": "В следващите дни предстоят валежи и ниски температури в цялата страна",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/3eb10f9c47c80c649bfd0b9b59b6aac2.webp",
                "article": "От Посредник news научаваме: Шофьорите, на които в следващите дни им предстои пътуване, да тръгват с автомобили подготвени за зимни условия. За днес – 24 ноември т. г. прогнозата е за интензивни валежи от дъжд в Северозападна България. През почивните дни се очаква валежите в Предбалкана и в Западна България да преминават в сняг и температурите да се понижават. В неделя – 26 ноември, в Западна и Централна България, както и в североизточните райони са възможни преспи и навявания от очаквания силен вятър. Агенция „Пътна инфраструктура“ апелира водачите да шофират с повишено внимание и съобразена скорост, като спазват необходимата дистанция, да не предприемат резки маневри. Блокирането на движението от превозни средства, които не са подготвени за зимни условия, затруднява пътуването на всички останали шофьори и работата на снегопочистващата техника. Областните пътни управления следят прогнозите на синоптиците по райони и заедно с пътноподдържащите фирми ще предприемат необходимите действия за обработка на настилките във високопланинските райони и проходите, където температурите са по-ниски и има предпоставки за хлъзгавост и заледявания особено рано сутрин. Целта е превантивните, а след това и снегопочистващите дейности да започват максимално бързо при прогноза за влошаване на времето, за да се осигури проходимостта на пътищата. Приоритет са автомагистралите, най-натоварените направления по първокласната и второкласната пътна мрежа и проходите, осигуряващи връзките между Северна и Южна България. Всички граждани и транспортни фирми могат да получават информация за актуалната пътна обстановка и зимното поддържане на републиканската мрежа от интернет страницата на АПИ – www.api.bg, както и по всяко време от денонощието на тел. 0700 130 20 в АПИ. Целогодишно при 24-часов режим работи Ситуационен център, който събира и обобщава данните за състоянието по републиканските пътища.",
                "_ownerId": "1",
                "category": "5",
                "region": "8",
                "_createdOn": 1700810547000,
                "_updatedOn": 1700810705000
            },
            "12408": {
                "title": "Компенсациите за деца без място в детска градина",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/ad1c9c3eb0fcdfeaa483a1df58c6739b.webp",
                "article": "Кабинетът отпуска 783 279 лева за компенсации на семействата на деца, за които не е осигурено място в детска градина за периода от 1 юли до 14 септември 2023 г. От тях 780 897 лева са предназначени за компенсиране на извършените от родителите разходи за отглеждане и обучение на 899 деца в Столична община. 1283 лева получават семействата на две деца в община Пловдив. 1099 лева се отпускат за компенсация за едно дете, което не е прието в детска градина в община Родопи. Право на компенсации от държавата имат родители на деца от тригодишна възраст до постъпването им в I клас, които не са приети в държавни или общински детски градини или училища, в които са кандидатствали. За тях общината по местоживеене не е предложила друго равностойно място в общинска детска градина или училище.",
                "_ownerId": "1",
                "category": "23",
                "region": "8",
                "_createdOn": 1700810976000,
                "_updatedOn": 1700810976000
            },
            "12409": {
                "title": "Правителството отпуска 1 млн. лв. за развитие на пътната инфраструктура в Силистра",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/84ffc0d139f45a383476425c9b7283b2.webp",
                "article": "Министерският съвет прие Решение за одобряване на финансирането на публична общинска инфраструктура по реда на Закона за насърчаване на инвестициите (ЗНИ). От бюджета на Министерството на иновациите и растежа за 2023 г. на Община Силистра ще се предоставят средства в размер до 985 482 лв. с ДДС за изграждане на елементи на общинска пътна инфраструктура: ,,Ремонт на обособени улици с идентификатори ПИ № 00895.506.50; ПИ № 00895.506.51 и ПИ № 00895.506.72 по КК и КР на с. Айдемир, Промишлена зона „Запад“ Силистра“ и „Разпределителен водопровод от ВВМ на гр. Силистра в ПИ № 66425.514.474, ПЗ „Запад“, гр. Силистра до разпределителен възел СК в ПИ № 00895.506.51 в землище с. Айдемир, община Силистра“. Инфраструктурата се изгражда във връзка с изпълнението на сертифицирания по ЗНИ инвестиционен проект „Складова база за съхранение на зърно“ в община Силистра на „Марлин“ ЕООД. Инвестицията по проекта е в размер над 48.1 млн. лв. В периода на осъществяване на инвестиционния проект и като резултат от него ще бъдат разкрити 17 нови работни места. С реконструкцията и изграждането на техническа инфраструктура ще се създадат условия за реализиране и на бъдещи инвестиционни намерения, като по този начин ще се подкрепи развитието на бизнеса и разкриването на допълнителни работни места. Реконструкцията на улицата и проектът за изграждането на водопровода съответстват на одобрените Подробни устройствени планове и схемите на техническата инфраструктура към тях. Новоизградената техническа инфраструктура ще обслужва и други ползватели: ,,Технотрейд“ ЕООД, ,,И-Уейст Силистра“ ЕАД, ,,Агротранс“ ЕООД, ,,Топ 13″ ЕООД, ,,Фазерлес“ АД, ,,Елкотех-Синхрон“ ООД, ,,Галакс ойл“ ООД, ,,Еликом Електроникс – Георгиев“ КД, ,,Зелен пазар“ АД и всички бъдещи инвеститори и всички съществуващи и потенциални физически\/юридически лица при равни и недискриминационни условия.",
                "_ownerId": "1",
                "category": "23",
                "region": "5",
                "_createdOn": 1700811362000,
                "_updatedOn": 1700811362000
            },
            "12410": {
                "title": "Съдебната администрация и Ученическият парламент в Силистра стартират съвместна инициатива за сътрудничество",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/1f343e31c0fb3fb2c4830e73c1e44e04.webp",
                "article": "Вчера, 23 ноември 2023 година бе поставено началото на сътрудничеството между Окръжен съд-Силистра и Ученически парламент-Силистра. Инициативата бе осъществена по идея на съдия Пламен Неделчев-Председател на Окръжен съд-Силистра, а организацията от страна на парламентаристите бе осъществено от Светлозара Ковачева – Председател на Ученически парламент-Силистра. Съдия Неделчев приветства гостите с пожелание началото на сътрудничеството да има успешно продължение в бъдеще: „Днес сте тук в качеството на изявени местни парламентаристи, пред които ще представим възможностите за участие в инициативите на Окръжен и Районен съд-Силистра по Образователната програма, начина на провеждане, както и темите, които развиваме в лекциите. Общата ни цел с Вас е повече ученици и преподаватели да научат за образователните инициативи на съдилищата. Темите представяме по много интересен, адаптиран и достъпен начин, така, че да ни разберат. Даваме интересни примери от практиката си, отговаряме на възникнали въпроси и се стараем знанията да са полезни в ежедневието на учениците. Като представители на Ученическият парламент, Вие общувате с много ученици и ще имате възможност да им разкажете наученото днес, да споделите впечатленията си, и да ги насърчите да ни посетят. Все по-голяма е необходимостта от правни знания в ежедневието и ние, съдиите и участниците в програмата, ще се радваме да постигнем успех сред учениците от всички възрасти.“-каза в обръщението си към младите парламентаристи съдия Неделчев. Всички ученици участваха активно като задаваха въпроси и слушаха с интерес отговорите. Те споделиха, че дискусията е била много вълнуваща и полезна за тях, ще разкажат на съучениците си за възможността да участват в Програмата, и с интерес ще се включат в нови съвместни мероприятия. Срещата приключи с благодарност към представителите на Ученическия парламент, че са оценили възможността за полезна и интересна съвместна дейност по правни теми. Учениците се снимаха в съдебната зала, получиха Конституция на Република България и образователни материали.",
                "_ownerId": "1",
                "category": "4",
                "region": "1",
                "_createdOn": 1700812008000,
                "_updatedOn": 1700812008000
            },
            "12411": {
                "title": "ЕГ „П. Яворов“ триумфира във волейболното състезание за купата на ПМГ",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/45b3000c4829dc1b307748e0de0cc784.webp",
                "article": "От 20 до 22 ноември, Природоматематическа гимназия (ПМГ) беше домакин на емоционалното и напрегнато състезание по волейбол за своята купа. Учениците от различни гимназии се събраха, за да демонстрират своите спортни умения и дух. Отборите на Езикова гимназия \"Пейо Яворов\" показаха изключителни умения и дисциплина, като се представиха отлично в категориите на момчетата и момичетата за възрастова група 8-10 клас. Момичетата записаха две победи, докато момчетата доминираха с три последователни успеха.Успехът на \"Яворовци\" е не само резултат от техните спортни умения, но и от тяхното неуморимо желание и старание. Г-н Ивайло Желязков, който подкрепяше тези млади спортисти, е ключов фигура за техния успех. ",
                "_ownerId": "1",
                "category": "16",
                "region": "6",
                "_createdOn": 1700812870000,
                "_updatedOn": 1700812870000
            },
            "12412": {
                "title": "\"Милостта на времето\": Откриха книгата на д-р Йордан Касабов в Калипетрово",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/2fa4f0319612cd36145c2ec9745321f6.webp",
                "article": "На 23 ноември 2023 г., библиотеката при Народно читалище \"Пробуда\" в село Калипетрово организира представяне на книгата \"Милостта на времето\" на известния етнолог от Силистра, д-р Йордан Касабов. Събитието, ръководено от библиотекаря Ирена Владимирова, привлече вниманието на жители на селото от различни възрасти. Книгата на д-р Касабов е сборник от етнографски изследвания, посветени на културата на българите. В нея авторът разглежда народни вярвания, обичаи, фолклор и традиции, подчертавайки значението на българското духовно наследство. По време на представянето д-р Касабов разкри основните теми на своята книга и сподели впечатленията си от написаното. Участниците в събитието проявиха голям интерес, като задаваха въпроси и изразиха своето уважение и благодарност към автора и организаторите за това вдъхновяващо и образователно събитие",
                "_ownerId": "1",
                "category": "11",
                "region": "5",
                "_createdOn": 1700813415000,
                "_updatedOn": 1700820858000
            },
            "12413": {
                "title": "Отмениха на наредбата за паркиране на хора с увреждания в Дулово",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/2a2ee5f5019fe9d81ecc5171c45fc00a.webp",
                "article": "Административният съд в Силистра отмени наредбата за паркиране на превозни средства, управлявани или превозващи лица с трайни увреждания в община Дулово. Това решение беше взето на 23 ноември 2023 г. след протест на прокурор от Окръжна прокуратура - Силистра. Според съда, наредбата беше приета в нарушение на изискванията за задължително становище от Агенцията за хората с увреждания, което е било валидно условие по време на нейното създаване. Несъответствието с това изискване беше оценено като съществено и доведе до отмяна на наредбата. В резултат, наредбата за паркиране на хора с увреждания в Дулово загуби своята правна сила",
                "_ownerId": "1",
                "category": "21",
                "region": "5",
                "_createdOn": 1700813927000,
                "_updatedOn": 1700820805000
            },
            "12414": {
                "title": "Дебют на Девина Василева като режисьор в Тутракан",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/c2ed930986e2cbe5516d398423ff73dc.webp",
                "article": "Девина Василева, дъщеря на известния Зуека и Нина Димитрова, направи своя дебют като режисьор на музикален видеоклип. Тя засне видеото към песента \"За жадните\", предназначена за петия албум на дуета \"Ша-Ша\". Снимките се осъществиха в живописния град Тутракан, като включваха кадри на стари къщи, лодки, салове, птици и рибари. Видеоклипът създава контраст между спокойствието на Дунав и динамичните нестинарски танци.",
                "_ownerId": "1",
                "category": "21",
                "region": "6",
                "_createdOn": 1700814149000,
                "_updatedOn": 1700814149000
            },
            "12415": {
                "title": "Празник на ПМГ \"Св. Климент Охридски\" в Силистра с Театрална Постановка",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/d11e8f0d3dd9b64231ffacbb4921721b.webp",
                "article": "На 24 ноември 2023 г., Природоматематическа гимназия \"Св. Климент Охридски\" в Силистра отпразнува своя патронен празник със специално тържество, организирано в залата на Драматичен театър Силистра. Тържеството включваше връчването на стипендиите \"Дачка Савова\" за отличия в математиката и информатиката, и \"Елица и Йосиф Захариеви\" за успехи в природните науки. След официалната част, учениците от Група за занимания по интереси \"Театрално изкуство\" под ръководството на Станислав Георгиев представиха постановка, вдъхновена от пиесата \"Езоп\" на Фридрих Шилер. Тържеството беше открито за всички граждани и гости на града",
                "_ownerId": "1",
                "category": "23",
                "region": "5",
                "_createdOn": 1700814357000,
                "_updatedOn": 1700814357000
            },
            "12416": {
                "title": "Съветите на ЕРП Север за справяне с лошото време",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/e1654da82034768495f428d453ed550a.webp",
                "article": " ЕРП Север предостави редица съвети в отговор на очакваните метеорологични промени през почивните дни. Ето някои от техните препоръки за бдителност и предпазливост: Използване на Електроуреди При смущения в електрозахранването, важно е да изключите от контакта неналежащите електроуреди, за да предотвратите евентуални повреди. Пазете се на открито Избягвайте минаването близо до въздушни електропроводни линии при силни ветрове или под натежали от лед електропроводи, за да предотвратите инциденти. Синоптиците съветват да избягвате пътуванията през този период, ако не са спешни. В случай на прекъснато електрозахранване, свържете се с ЕРП Север на посочените телефони. Съхранявайте хладилници и фризери затворени, използвайте ограничено устройства на батерии, и изключете електроуредите за предпазване от токови удари. ЕРП Север уверява, че техните дежурни екипи са в готовност да реагират своевременно за възстановяване на електрозахранването в случай на критични метеорологични ситуации​",
                "_ownerId": "1",
                "category": "21",
                "region": "4",
                "_createdOn": 1700829204000,
                "_updatedOn": 1700829233000
            },
            "12417": {
                "title": "Проактивни мерки в Силистра за предстоящата зима: спешна среща за подготовка на снегопочистването",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/e2081775f595071e8dcce0eb1f786274.webp",
                "article": "В отговор на предстоящите зимни условия и очаквани снеговалежи, премиерът акад. Николай Денков нареди на областния управител на Силистра, Минчо Йорданов, да проведе спешна координационна среща. Участници в срещата включваха общинските ръководства, областната дирекция на \"Пожарна безопасност и защита на населението\", областното пътно управление на Агенция \"Пътна инфраструктура\", областната дирекция на \"Пътна полиция\" и фирмите, ангажирани със снегопочистването. Целта на срещата е да се провери и потвърди готовността на всички екипи за предстоящите зимни условия, гарантирайки, че населените места в страната могат да посрещнат зимните предизвикателства без проблеми",
                "_ownerId": "1",
                "category": "8",
                "region": "6",
                "_createdOn": 1700829910000,
                "_updatedOn": 1700830045000
            },
            "12418": {
                "title": "Пандемията води до десетилетен спад в продължителността на живота в България",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/5ed56776877754fc2df91556b151eb4e.webp",
                "article": "Според проучване на Института за пазарна икономика: Пандемията е довела до значително намаляване на очакваната продължителност на живота в България. Изследването, което анализира 73 различни индикатора, включително заплати, заетост, инвестиции, образование и здравеопазване, показва, че преждевременната смърт на над 40 000 души, заразени с коронавируса, е довела до спад на очакваната продължителност на живота от 72 години през 2019 г. до 69 години след пандемията. Това отменя прогреса, постигнат между 2010 и 2019 г., като ефективно връща страната с десетилетие назад по отношение на този показател​​.",
                "_ownerId": "1",
                "category": "1",
                "region": "7",
                "_createdOn": 1700830608000,
                "_updatedOn": 1700830692000
            },
            "12419": {
                "title": "Екстремни зимни условия: шест български области под червен код за снеговалежи",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/2e66f9f5eff75c92258d65af5d88eae8.webp",
                "article": "Националният институт по метеорология и хидрология (НИМХ) обяви червен код за опасно време в областите Враца, Монтана, Ловеч, Габрово, Велико Търново и Русе. С прогноза за обилни снеговалежи през уикенда. Снеговалежите могат да достигнат до 40-65 мм, като се очаква и образуване на снежна покривка, особено в планинските райони, където са възможни виелици и навявания. Силният северозападен вятър с пориви до 20-24 м\/сек може да предизвика смущения в транспорта и да затрудни движението по планинските проходи. Оранжев код за опасно време е обявен за редица други области, включително Благоевград, Видин, Варна, и София, докато област Бургас е под жълт код за опасни валежи. Гражданите се призовават да бъдат бдителни и да се информират навреме за променящите се метеорологични условия​​.",
                "_ownerId": "1",
                "category": "6",
                "region": "3",
                "_createdOn": 1700831041000,
                "_updatedOn": 1700831041000
            },
            "12420": {
                "title": "Завършващия домакински Мач на Доростол за 2023, ще се състои срещу Лудогорец",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/6374a8e0f09e392ed68e3bb0ebdb459b.webp",
                "article": "Футболният отбор Доростол (Силистра) се подготвя за последното си домакинство за 2023 година срещу Лудогорец III (Разград). Мачът, който е част от 12-ия кръг на Североизточната Трета лига, се очаква да се проведе при тежки метеорологични условия. Треньорът на Доростол, Деян Дечев, коментира, че неблагоприятното време може да бъде в полза на неговия отбор. Въпреки младостта и потенциала на футболистите на Лудогорец, Доростол има амбицията да спечели, като се възползва от предимството на домакинския терен, въпреки проблемите от продължителната пауза в игрите.",
                "_ownerId": "1",
                "category": "5",
                "region": "4",
                "_createdOn": 1700831507000,
                "_updatedOn": 1700831507000
            },
            "12421": {
                "title": "Правосъдие за семейството: съдът в Силистра призна правото на еднократна помощ за дете, отглеждано от баба и дядо",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/12c0fcf4036ea885176db827fd996d5d.webp",
                "article": "Административен съд в Силистра постанови важно решение, отменяйки отказа за отпускане на еднократна помощ за дете, настанено при баба и дядо. Решението № 110 от 16.12.2021 г. на СОС по гр. д. № 320\/2021 г. предоставя родителските права на майката на детето Е.Б.И., като определя местоживеенето му при баба и дядо по майчина линия. Жалбоподателят, дядото на детето, беше обжалвал заповедта на Директора на Дирекция \"Социално подпомагане\" в Силистра, която отказваше помощ. Съдът призна, че настаняването на детето при баба и дядо се счита за мярка за закрила със същите правни последици като официалното настаняване по Закона за закрила на детето. Така семейството, отглеждащо детето, има право на подпомагане съгласно Закона за семейните помощи за деца. След като отмени оспорената заповед, съдът нареди на органа да се произнесе отново, като вземе предвид мотивите на решението. Освен това, съдът постанови жалбоподателят да получи обратно средствата, които е похарчил за делото, включително 400 лева за адвокатски хонорари",
                "_ownerId": "1",
                "category": "18",
                "region": "8",
                "_createdOn": 1700831991000,
                "_updatedOn": 1700831991000
            },
            "12422": {
                "title": "Министър Радев и експерти обсъждат стратегията за енергийно развитие на България до 2030 г.",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/559c6170c078daa15c4c357992a6ff86.webp",
                "article": "Министър Румен Радев участва в дискусия за Стратегията за устойчиво енергийно развитие на България до 2030 година, като подчерта значението на приемствеността и екипната работа в енергийния сектор. Срещата, организирана от евродепутата Цветелина Пенкова, беше фокусирана върху ключовите акценти в проекта на стратегията. Заместник-министър Ива Петрова обясни, че енергийната сигурност, декарбонизацията, децентрализацията и демократизацията са в основата на документа, който надгражда и развива сценарии, разработени от Комисията за енергиен преход. Целта е да се очертаят мерки и политики за сигурни и достъпни енергийни доставки за всички потребители. За гарантиране на енергийната сигурност проектът предвижда продължаване на инвестициите във ВЕИ, съчетани с нови гъвкави нискоемисионни мощности. През следващото десетилетие България ще продължи да разчита на въглищните мощности, но тяхното участие в енергийния микс ще бъде изцяло на пазарен принцип. В по-дългосрочен план се предвижда изграждането на две нови ПАВЕЦ и два нови ядрени блока. Необходимостта от развитие на мрежите, модернизацията и дигитализацията им са водещо условие за надеждно и сигурно енергоснабдяване. Екипът на Министерството на енергетиката, работил върху проекта на стратегия, вижда демократизацията на процеса като пряко участие на всички заинтересовани страни в разработването на документа. Работата по проекта на енергийна стратегия продължава. Документът ще бъде синхронизиран с плана Енергетика-климат, който ще бъде актуализиран до м. юни 2024 година, съобщиха от пресцентъра на Министерството на Енергетиката",
                "_ownerId": "1",
                "category": "23",
                "region": "7",
                "_createdOn": 1700832535000,
                "_updatedOn": 1700832535000
            },
            "12423": {
                "title": "Българското правителство отпуска 400 хиляди лева за поддръжката на Рилския манастир",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/bd3f63a9fa68c1e7776b8b6efc89c513.webp",
                "article": "Новини БГ съобщават: Българското правителство одобри допълнителни разходи от 400 000 лева за Рилския манастир „Свети Иван Рилски“. Тази сума е предназначена за поддържането и подобряването на тази важна културна забележителност, която е символ на България и е включена в Списъка на световното наследство на ЮНЕСКО. Рилският манастир е обявен за „народна старина“ още през 1927 г., а през 1968 г. Хрельовата кула в манастира е обявена за архитектурно-строителен паметник на културата от Средновековието. През 1983 г., на сесията на Комитета за световно наследство към ЮНЕСКО, манастирът е включен в списъка на световното културно наследство. В Рилския манастир се пазят ценни културни съкровища, включително ръкописи, старопечатни книги, документи от XIV - XIX век, както и много старинни предмети като черковна утвар, жезли, икони, оръжия и монетна колекция. Освен това, манастирът включва и църквите „Свети Лука“ и „Свети Покров Богородичен“, както и килийното училище, метохът Пчелина и други значими културни и исторически места. Тези обекти са обявени за групови архитектурни, исторически и художествени комплекси от национално значение. Допълнителните средства се отпускат в рамките на ангажиментите, поети от страната за запазване и съхранение на манастирския комплекс в автентичен вид, като част от своите задължения към ЮНЕСКО. Те ще помогнат за финансирането на дейности по ремонт, консервация и реставрация, както и за други инициативи, свързани с опазването и представянето на културната ценност на манастира",
                "_ownerId": "1",
                "category": "1",
                "region": "6",
                "_createdOn": 1700834179000,
                "_updatedOn": 1700834486000
            },
            "12424": {
                "title": "Успешна акция на митниците на Капитан Андреево: задържани над 52 хиляди контрабандни цигари от Турция",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/13c482ddde5b3a060bbfaafeae659a78.webp",
                "article": "Митничарите на граничен пункт Капитан Андреево проведоха успешна операция по противодействие на контрабандата на цигари, резултатът от която е задържането на общо 2627 кутии (52 540 къса) контрабандни цигари. Това беше постигнато при пет отделни проверки на товарни автомобили, влизащи в България от Турция. При един от случаите на 18.11.2023 г., товарен микробус с чужда регистрация, управляван от турски гражданин, беше избран за щателна митническа проверка. При физическия контрол митничарите откриха цигарите, укрити на различни места в превозното средство, включително в резервната гума, фабрични кухини в тавана на шофьорската кабина и в сак в товарното помещение. Също така, в други четири камиона бяха открити общо 1300 кутии нелегални цигари, като тютюневите изделия бяха укрити на различни места като черни полиетиленови торби, закрепени на шасито, фригоавтомата, фабрична кухина в тавана на полуремаркето и в горните греди на полуремаркето. Всички цигари бяха задържани, а на петимата водачи, турски граждани, бяха съставени актове за опит да бъдат пренесени акцизни стоки през държавната граница без знанието и разрешението на митническите органи. ",
                "_ownerId": "1",
                "category": "19",
                "region": "4",
                "_createdOn": 1700834688000,
                "_updatedOn": 1700834688000
            },
            "12425": {
                "title": "Община Главиница уведомява гражданите за проблемите с електрозахранването и текущите преговори",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/20a23cdf05d02c4e91b7d9d6deea6897.webp",
                "article": "Община Главиница официално уведомява своите жители за текущата ситуация, свързана с предоставянето на електроенергия. В отговор на приетата от Общинския съвет декларация относно некачественото предоставяне на електроенергия и нейното отражение върху местното население, са провеждани тристранни срещи между „ЕРП-СЕВЕР“ ЕАД, „ЕСО“ ЕАД и Комисията за енергийно и водно регулиране (КЕВР). Целта на тези срещи е да се намери решение на проблема с честите прекъсвания в електрозахранването в общината. Администрацията на община Главиница подчертава своя ангажимент да следи развитието на преговорите. В случай, че не бъде постигнато удовлетворително решение, общината планира да отнесе казуса до парламентарната трибуна, за да защити интересите на своите жители. ",
                "_ownerId": "1",
                "category": "4",
                "region": "6",
                "_createdOn": 1700835215000,
                "_updatedOn": 1700835215000
            },
            "12426": {
                "title": "Община Дулово Проведе Кризисно заседание за справяне със зимните условия",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/4f4218766434204ba21c330471c526da.webp",
                "article": "На 24 ноември Община Дулово проведе превантивно заседание на своя Общински кризисен щаб под ръководството на кмета инж. Невхис Мустафа. В срещата участваха и заместник-кметовете, както и представители на местните служби за аварийни ситуации, образованието и общинската администрация. Обсъдени бяха мерки за предотвратяване на проблеми, свързани с предстоящите снеговалежи и ниските температури. Отделните институции докладваха за готовността си да реагират при усложнена метеорологична обстановка. Въпреки че общината все още няма подписани договори за снегопочистване, кметът Мустафа информира за напредъка на процедурата и усилията да се осигури поддържането на улиците и пътищата чисти. Тя благодари на местните жители и предприятия, които помогнаха доброволно в снегопочистването, и призова за солидарност и отговорност от страна на бизнеса за поддържането на прилежащите територии. Срещата подчерта ангажимента на общината да осигури безопасни и проходими условия за жителите на Дулово през зимния сезон",
                "_ownerId": "1",
                "category": "16",
                "region": "4",
                "_createdOn": 1700868789000,
                "_updatedOn": 1700868789000
            },
            "12427": {
                "title": "Благотворителен коктейл организиран от Ротари клуб в Силистра за подкрепа на местните деца",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/80a23ce00e2d0e17a859b2bf25113bab.webp",
                "article": "Ротари клуб Силистра организира благотворителен коктейл, насрочен за 9 декември 2023 г. в клуб \"РОЯЛ КАФЕ\", разположен на трети етаж на Централ парк. Събитието, с начален час 19:00, предвижда вход с куверт от 70 лева. Основната цел на това събитие е събирането на средства за подпомагане на децата в Силистра. Планира се събраните средства да бъдат използвани за закупуване на учебници, спортни пособия и други материали, които са необходими за обучението и развитието на децата в региона. Ротари клубът кани всички жители на Силистра, които желаят да подкрепят благотворителната кауза, да присъстват на коктейла и да допринесат за подпомагането на местните деца.",
                "_ownerId": "1",
                "category": "22",
                "region": "3",
                "_createdOn": 1700868987000,
                "_updatedOn": 1700868987000
            },
            "12428": {
                "title": "Доростол U15 с две загуби в баскетболни мачове във Варна",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/703dbd050900b60fa8b3efb015e9d917.webp",
                "article": " Отборът на Доростол U15 за съжаление претърпя две загуби в своите мачове във Варна. В първия си мач отборът се изправи срещу Вълци Разград, като успя да води в първата част с резултат 14 срещу 16. Въпреки това, Вълци Разград завзеха водеща позиция във втората и третата част с резултати 19 срещу 10 и 19 срещу 15. Въпреки усилената игра на Доростол в последната четвърт, те не успяха да постигнат победа и мачът завърши с резултат 66 на 59 в полза на Вълци Разград. Във втория си мач срещу Черно море Тича, Доростол игра без Мартин Златев, капитана на отбора, който получи контузия в края на първия мач. Мачът се характеризираше с липса на интрига, като в края на първото полувреме резултатът беше 46 срещу 23 в полза на Черно море Тича. Въпреки че Доростол остана без още един от основните си състезатели поради травма, те успяха да намалят разликата в резултата през последната четвърт, завършвайки мача с 71 срещу 61 за Черно море Тича",
                "_ownerId": "1",
                "category": "10",
                "region": "4",
                "_createdOn": 1700869587000,
                "_updatedOn": 1700869587000
            },
            "12429": {
                "title": "Премиер Денков обеща подкрепа за лекарите и здравеопазването на конгрес на БЛС",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/76cb6a27bb6f6c011bcc8be1d5adb4d4.webp",
                "article": "Премиерът акад. Николай Денков заяви пред лекарите своята готовност и ангажираност за подобряване на условията на работа и подкрепа на здравеопазването в България. Той направи изявлението си след официалното откриване на Шестия национален конгрес \"Политики в здравеопазването\", организиран от Българския лекарски съюз. Премиерът подчерта значението на диалога и взаимното разбирателство с лекарската общност. Той обяви, че властите са готови да вземат предвид препоръките и мненията на лекарите за подобряване на здравната система. Денков посочи, че срещите с лекарите, проведени миналата седмица, са били изключително полезни за разбиране на техните притеснения и потребности, особено по въпросите на антибиотиците и хартиените рецепти. Премиерът обеща, че правителството ще вземе всички мерки, за да се подобри качеството на работата на лекарите и да се гарантира по-добро обслужване на пациентите. Той подчерта, че основната цел е подобряване на здравните резултати и общото здраве на нацията. Същия ден правителството одобри проекта за Закон за бюджета на Националната здравноосигурителна каса за 2024 година, като предвидени са общи приходи и трансфери в размер на 8,163 милиарда лева. Това решение отразява ангажимента на правителството за подкрепа и развитие на здравеопазването в страната",
                "_ownerId": "1",
                "category": "6",
                "region": "2",
                "_createdOn": 1700870478000,
                "_updatedOn": 1700870478000
            },
            "12430": {
                "title": "Нова ера в туризма: България дигитализира 100 национални туристически обекта",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/2cef447c2155c19dfef394eec5702c2c.webp",
                "article": "Иновативният проект за дигитализация на 100 национални туристически обекта в България, реализиран от Българския туристически съюз и Yettel, получи първо отличие за своя принос в развитието на интелигентния туризъм в страната. Този успех беше отбелязан само три месеца след старта на инициативата, която беше удостоена с наградата „Интелигентна туристическа дестинация“ от SMARTOURISM.BG. Отличието беше връчено на ежегодната национална конференция SMARTOURISM.BG в София, проведена под патронажа на Министерството на туризма. Дигитализацията на обектите позволява на туристите да получават дигитални печати в мобилното приложение на Yettel, което е безплатно и налично на английски език. Дигитализираните профили включват 176 туристически обекта, предоставяйки полезна информация за посетителите, както и аудио и видеоразкази. Видеата са обогатени с илюстрации от талантливи български артисти и кратки разкази за обектите. Някои от първите обекти с видеоразкази включват Казанлъшката гробница, Музей „Старинен Несебър“ и Античен театър Ягодинска пещера, с планове за добавяне на още съдържание. Проектът има за цел да предложи нови начини за прекарване на времето навън и да улесни създаването на връзки между различните поколения, като привлича младите хора с предпочитание към смарт технологиите и дигиталното пространство. Приложението ще продължава да се обогатява с ново съдържание и функционалности.",
                "_ownerId": "1",
                "category": "23",
                "region": "5",
                "_createdOn": 1700894865000,
                "_updatedOn": 1700894865000
            },
            "12431": {
                "title": "Трагичен инцидент край Сребърна затвори пътя Силистра - Русе",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/165fba322836163263679226fc2abd19.webp",
                "article": "Пътят между Силистра и Русе е временно затворен в района на Сребърна, след като в 19:31 ч. на снощи е бил получен сигнал за пътнотранспортно произшествие. На мястото на инцидента, в участъка между разклоните за селата Ситово и Сребърна, беше открит починал 63-годишен мъж от село Поройно, водач на каруца, теглена от кон, съобщиха от полицията тази сутрин. Проведен е оглед на местопроизшествието, и в момента се изясняват фактите и обстоятелствата около инцидента. Образувано е досъдебно производство. Трафикът е пренасочен по обходен маршрут, а властите призоват шофьорите да се движат с повишено внимание.",
                "_ownerId": "1",
                "category": "20",
                "region": "7",
                "_createdOn": 1700896611000,
                "_updatedOn": 1700896823000
            },
            "12432": {
                "title": "За всеки, който ще пътува, ето каква е пътната обстановка в страната",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/f9bb1d97ff050ef4cd61ff70e21460e9.webp",
                "article": "От научаваме: С настъпването на зимния сезон, обстановката по пътищата в България се усложнява заради снеговалежи и намалена видимост. В монтанско и софийско вече е завалял сняг, като в монтанско снегът бързо се натрупва, като над десет машини се заемат с почистването на областта. Пътят на проход „Петрохан” е заснежен, но е почистен. В същото време, движението на тежкотоварни превозни средства над 12 тона по път II-35 Троян - Кърнаре през проход \"Троянски\" е ограничено заради снеговалежа. Температурите в страната варират между 2°С и 11°С, като времето е облачно и с вятър. Освен снега, в страната има и слаб дъжд. Поради мокрите пътни настилки, особено във високите и усойни места, съществува риск от заледяване. От АПИ предупреждават шофьорите да бъдат изключително внимателни и да се подготвят за зимни условия. МВР съветва пътуващите през планинските проходи да имат подготвени автомобили и в случай, че колите не са оборудвани за зимни условия, полицията ще спира движението им. МВР също така призовава да не се пътува през прохода „Шипка\", където обикновено натрупва най-много сняг. Намалена видимост поради мъгла се наблюдава на няколко места в страната, включително прохода „Шипка“ и АМ „Тракия“ в участъка Оризово – Ст. Загора ",
                "_ownerId": "1",
                "category": "11",
                "region": "4",
                "_createdOn": 1700897903000,
                "_updatedOn": 1700898116000
            },
            "12433": {
                "title": "От какво зависи успеха в училище на различните деца",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/44ee3c226c3a98a460589d7344164afa.webp",
                "article": " Въпреки често срещаните схващания, успехът в училище не винаги корелира с образованието на родителите, семейното богатство или броя на книгите в дома. Скорошно изследване разкрива три неочаквани фактора, които значително влияят на учебните постижения на децата. Ролята на баба и дядо Оказва се, че присъствието на баби и дядовци в живота на детето е съществен фактор. Децата, които живеят или активно общуват със своите баби и дядовци, постигат по-високи оценки. Това подчертава важността на семейните ценности и междупоколенческите взаимоотношения. Значението на семейните празници Редовното отбелязване на семейни събития, особено тези, които са добре организирани, също има положителен ефект върху училищните постижения. Това показва, че ангажираността на семейството в културни и семейни традиции е от съществено значение. Удовлетвореността на родителите Родители, които се чувстват удовлетворени от своя живот и имат положително отношение към своята работа, често имат деца с високи учебни постижения. Позитивната домашна среда и отношението на родителите са критични за училищния успех на техните деца. Тези открития подчертават, че най-важният фактор за училищния успех е вътрешната среда на семейството и поддържаните в него ценности и взаимоотношения, а не толкова материалните ресурси или външни условия. Това изследване предоставя нова перспектива за тов",
                "_ownerId": "1",
                "category": "18",
                "region": "8",
                "_createdOn": 1700902471000,
                "_updatedOn": 1700902471000
            },
            "12434": {
                "title": "Предстои мощен вихър с дъжд, сняг и силен вятър в България през уикенда",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/a6e16d18445ca6dda68dc5f85124b0fb.webp",
                "article": "Надвисващ нов съботно-неделен вихър се очаква да засегне България, като ще донесе дъжд, сняг и силен вятър. Под влияние на циклон, преминаващ през Черно море, времето в страната ще се усложни, като в нощта срещу събота дъждът над Северозападна България ще се превърне в сняг. През деня в събота, застудяването ще продължи от запад на изток, като дъждът ще премине в сняг на все повече места, включително и в югоизточната част на страната и по морския бряг. Очакват се значителни количества валежи, с между 30 и 80 кв.м в повечето части на страната, което може да доведе до повишаване на реките, разливи и наводнения. С усилването на вятъра от северозапад ще се образуват виелици и навявания на преспи, особено по проходите и в североизточните райони, където поривите на вятъра могат да надминат 100 км\/ч. В планинските райони също се очакват заледявания. Все още наличната листна маса може да доведе до счупвания на клони или падане на дървета. От MeteoBulgaria съветват гражданите да ограничат пътуванията си през уикенда или да шофират само с автомобили, оборудвани за зимни условия, в случай на крайна необходимост. Препоръчва се също така да се избягва стоянето и паркирането под дървета. Предупреждението е за ниво 2 и ниво 3 за 25 и 26 ноември заради опасността от дъжд, сняг и вятър.",
                "_ownerId": "1",
                "category": "4",
                "region": "1",
                "_createdOn": 1700918298000,
                "_updatedOn": 1700918298000
            },
            "12435": {
                "title": "Разнообразие от работни позиции на разположение в област Силистра",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/1f7b7a25f098c17f6a6005e195b48ea3.webp",
                "article": "Към 27 ноември 2023 г., в област Силистра са обявени свободни работни места за различни специализации. Включени са позиции като готвачи, социални работници, хигиенисти, оператори на периферни устройства, миячи на превозни средства, офицери, работници в кухня, контрольори на качеството, машинни оператори, продавачи, заварчици, обслужващ персонал, шлосери, счетоводители, медицински специалисти, логопеди и пекари. Тези възможности за работа са разпространени в различни общини на областта, като предлагат възможности както за хора със средно, така и с висше образование",
                "_ownerId": "1",
                "category": "19",
                "region": "3",
                "_createdOn": 1700927388000,
                "_updatedOn": 1700927388000
            },
            "12436": {
                "title": "Нова финансова подкрепа за 46 000 домакинства в България",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/a00f72563657f5ed2b18d7eb017ffb6c.webp",
                "article": "46 000 български домакинства ще получат еднократна добавка от 148,35 лв. за компенсиране на повишените разходи за отопление през миналия зимен сезон Тази помощ е част от програмата \"Подкрепа за уязвими домакинства – SAFE\", реализирана от Оперативна програма \"Развитие на човешките ресурси\" 2014 – 2020. Добавката цели да компенсира високото ниво на инфлация, предизвикано от ръста на цените на електроенергията и топлоенергията вследствие на военната агресия на Русия в Украйна. Подкрепата е насочена към домакинства с членове със значително намалена работоспособност или възрастни над 75 години с тежки увреждания, които не получават целева помощ за отопление",
                "_ownerId": "1",
                "category": "1",
                "region": "3",
                "_createdOn": 1700927584000,
                "_updatedOn": 1700927584000
            },
            "12437": {
                "title": "България: Без аргументи срещу влизането в Шенген",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/b7decb592a043f414876024c3d84610c.webp",
                "article": "Премиерът Николай Денков заяви, че няма реални аргументи срещу приемането на България и Румъния в Шенгенското пространство. В интервю за австрийската обществена телевизия ORF, Денков обясни, че България е изпълнила всички технически изисквания за членство в Шенген преди повече от десетилетие. Той изрази опасения, че ако позицията на Австрия не се промени, това ще предизвика разочарование в България и нестабилност на Балканите. Според Денков, проблемите са свързани повече с вътрешните въпроси на Австрия, отколкото със самата България и Румъния. Той подчерта, че българската граница е добре пазена и че страната не е проблем за Шенгенското пространство",
                "_ownerId": "1",
                "category": "23",
                "region": "6",
                "_createdOn": 1700927822000,
                "_updatedOn": 1700927822000
            },
            "12438": {
                "title": "Цените в лева и евро трябва да започнат да се появяват около юли 2024 г",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/47ba501e35ad30069fca78471d1c8904.webp",
                "article": "Андрей Гюров, подуправител на БНБ, обяви, че цените в България ще започнат да се появяват и в лева, и в евро около юли 2024 г. Това ще се случи след като България получи становище от Европейската комисия и Европейската централна банка за присъединяване към еврозоната. Гюров отговори на критиките, че централната банка не обяснява достатъчно значението на въвеждането на еврото, като подчерта, че се провежда актуализация на Плана за въвеждане на еврото, която включва и широкомащабна информационна кампания",
                "_ownerId": "1",
                "category": "18",
                "region": "7",
                "_createdOn": 1700927962000,
                "_updatedOn": 1700927962000
            },
            "12439": {
                "title": "Дисциплинарни производства срещу още 7 полицаи за насилие на протеста в София",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/c9afeef0587ddff69dcc0ca522aafd08.webp",
                "article": "Дарик News съобщават: Дисциплинарни производства са образувани срещу още седем полицаи заради упражняване на полицейско насилие по време на протест на футболните фенове в София. Тази информация е получена от източници, свързани с разследването. Преди това, ръководството на СДВР вече беше отстранило трима полицаи, а проверката по случая продължава",
                "_ownerId": "1",
                "category": "21",
                "region": "1",
                "_createdOn": 1700928156000,
                "_updatedOn": 1700928156000
            },
            "12440": {
                "title": "Денков: Над 20 жени са убити от мъже в България тази година",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/9f9055b1ffa95d126d3e1f2039eceecb.webp",
                "article": "Премиерът на България, акад. Николай Денков, обяви в Международния ден за борба с насилието над жените, че през 2023 година над 20 жени са убити от мъже в страната. Общо 1359 случая на домашно насилие са регистрирани, като това представлява само тези случаи, за които има информация. Денков подчерта, че насилието не е просто проблем на жените, а засяга всички уязвими индивиди. Кабинетът е предприел мерки за борба с домашното насилие, включително създаване на Национален съвет и сектор за домашно насилие, обучение на специалисти и увеличаване на броя на кризисните центрове. Главният комисар на МВР Живко Коцев съобщи за сериозно увеличение на сигналите за домашно насилие през 2023 г., с 81.4% увеличение в сравнение с предходната година",
                "_ownerId": "1",
                "category": "18",
                "region": "3",
                "_createdOn": 1700928264000,
                "_updatedOn": 1700928264000
            },
            "12441": {
                "title": "17-годишна кикбоксьорка доминира на световната сцена",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/f7d3c327f8633916d0c1415e61845d75.webp",
                "article": "Калина Бояджиева, на 17 години, постави нов рекорд в световния кикбокс, като спечели златен медал на световното първенство в Албуфейра, Португалия. Тя стана шампионка в категорията над 70 килограма в стиловете пойнтфайтинг и киклайт контакт. Бояджиева постигна най-бързата победа в историята на международната федерация WAKO, като спечели своя мач за 47,6 секунди. Тя се нарежда сред водещите спортисти в кикбокса и таекуондото, като спечели не само световни, но и европейски титли в последните три години. С тези постижения, Бояджиева влиза в историята на българския кикбокс като първата жена със световна титла в татами стиловете от тяхното въвеждане в България през 1992 г",
                "_ownerId": "1",
                "category": "1",
                "region": "1",
                "_createdOn": 1700928367000,
                "_updatedOn": 1700928367000
            },
            "12442": {
                "title": "ЕК Отчете успокоение в цените на Имотите",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/263e4e55fce5598daa9739eabd862df7.webp",
                "article": "Според доклада на Европейската комисия (ЕК), публикуван на 21 ноември, се очаква, че номиналният растеж на цените на имотите в България се е успокоил, но все още е на високо ниво. Въпреки това, темпът на вземане на заеми от домакинствата остава непроменен, и равнището на дълг на домакинствата се поддържа стабилно, с тенденция към намаляване. Докладът по механизма за ранно предупреждение, който е част от Годишната стратегия за устойчив растеж за 2024 г., посочва и че силната външна позиция на страната и продължаващият процес на номинална конвергенция смекчават рисковете в икономиката",
                "_ownerId": "1",
                "category": "5",
                "region": "3",
                "_createdOn": 1700928456000,
                "_updatedOn": 1700928456000
            },
            "12443": {
                "title": "Наложени глоби покрай нелоялни търговски практики за Черен Петък",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/a029bb9a20bab5a3a68acc8476e8bc58.webp",
                "article": "Комисията за защита на потребителите (КЗП) наложи глоби на някои търговци покрай Черния петък заради нелоялни търговски практики. След около 360 проверки, основните нарушения са свързани с начина на обявяване на цените и липсата на яснота относно старите цени, което затруднява потребителите да разберат реалните намаления. Също така са установени нарушения за необявяването на срока на действие на промоциите. Глобите за тези практики достигат до 50 000 лева, като за настоящата година са издадени наказателни постановления за общо близо 5,5 млн. лв",
                "_ownerId": "1",
                "category": "16",
                "region": "4",
                "_createdOn": 1700928657000,
                "_updatedOn": 1700928657000
            },
            "12444": {
                "title": "Условията за туризъм в българските планини са неблагоприятни",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/046b3531843e2f211c8a8968ae7790c8.webp",
                "article": "Планинската спасителна служба (ПСС) съобщава, че условията за туризъм в българските планини в момента не са подходящи. Времето е мъгливо с валежи на дъжд, който преминава в сняг. Очакват се заледявания и формиране на снежна покривка. Националният институт по метеорология и хидрология съобщава за обилни валежи и снеговалежи, особено във високите планински части. Ще духа силен югозападен вятър, който ще премине в снежни виелици, преспи и навявания, което ще доведе до значително намалена видимост и понижение на температурите",
                "_ownerId": "1",
                "category": "6",
                "region": "8",
                "_createdOn": 1700928764000,
                "_updatedOn": 1700928764000
            },
            "12445": {
                "title": "ЧЕРВЕН КОД: Лютата зима идва в Силистра",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/b5ea4ef898d28a75e3ba260d6b9bae5b.webp",
                "article": "За 26 ноември 2023 г. НИМХ издаде червен код за обилни снеговалежи и бурен вятър в следните области: Разград, Шумен, Силистра и Добрич. През нощта срещу неделя валежите ще продължат, ще са значителни, в по-голямата част от Източна България дъждът също ще премине в сняг, съобщиха от Националния институт по метеорология и хидрология (НИМХ). Вятърът от север-северозапад ще започне да се усилва, в Североизточна България - до бурен. Ще има виелици и навявания, по-значителни - в североизточните райони от страната.",
                "_ownerId": "1",
                "category": "23",
                "region": "5",
                "_createdOn": 1700936164000,
                "_updatedOn": 1700936164000
            },
            "12446": {
                "title": "ОБЛАСТ СИЛИСТРА Е БЛОКИРАНА: Всички пътища от и до населените места са затворени",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/351f5b0712630872e1fb077ea14b8417.webp",
                "article": "Затворени за движение на МПС са основните пътни артерии на територията на област Силистра със заповед на директора на ОПУ. Изградени са 5 КПП, които не допускат движение на МПС извън територията на областта: в Силистра - на изхода за Добрич, в Тутракан - на изходите за Русе и Разград, Дулово - на изходите за Силистра и Разград. Обстановката в общината е усложнена от силната виелица, снеговалеж и навявания, съобщават от общинска администрация във Фейсбук. Ток няма почти във всички населени места. Пътищата към съседните области са затворени. Не пътуват автобуси. Снегопочистването е започнало, но поради навявания, на места снегът е много над падналите около 20 см., процесът е бавен. По пътищата има разнесен пясък и луга и се работи за овладяване на ситуацията. Няма бедстващи хора! Данните са от дежурен ОМП, към 8.15 ч.",
                "_ownerId": "1",
                "category": "18",
                "region": "2",
                "_createdOn": 1700982537000,
                "_updatedOn": 1700982805000
            },
            "12447": {
                "title": "Екипи на пожарната евакуират десетки закъсали автомобили в цялата област",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/b736847077aebe5c550639e8c5cec646.webp",
                "article": "Към момента екипи на пожарната са на терен и работят за евакуиране на хора от закъсали МПС: автобус със 7 пътници до Средище, десетина леки коли между Богорово и разклона за Срацимир, получен е сигнал за закъсали автомобили и в района на Черковна.",
                "_ownerId": "1",
                "category": "8",
                "region": "5",
                "_createdOn": 1700985957000,
                "_updatedOn": 1700985957000
            },
            "12448": {
                "title": "НЕВХИС МУСТАФА: Не предприемайте пътувания извън община Дулово",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/7347069a8de8e21867e12a14da24956d.webp",
                "article": "Предвид сложната метеорологична обстановка, моля жителите на община Дулово да не пътуват извън общината и населените си места, съобщава кметът на общината Невхис Мустафа в личния си Фейсбук профил. ✅ Машини разчистват в момента, екипите на общината работят и са на разположение. ✅ Осигурени са легла за родилки и хора на хемодиализа в МБАЛ Дулово. ✅ Електричеството в много от населените места е прекъснато. ✅ Екипите на ЕРП са в готовност и работят.",
                "_ownerId": "1",
                "category": "8",
                "region": "2",
                "_createdOn": 1700986164000,
                "_updatedOn": 1700986164000
            },
            "12449": {
                "title": "В МОМЕНТА: Общинският кризисен щаб в Силистра заседава",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/618abafa49292747f7f2d5289f11119e.webp",
                "article": "Кметът на община Силистра - г-н Александър Сабанов свика в 10.00 ч. заседание на Общинския кризисен щаб, което тече и в момента, съобщават от администрацията. В него участие ще вземат представители на ОПУ, на ПАБ, на аварийните екипи и на комуналните дружества. На него ще бъдат обсъдени и съгласувани всички действия по отстраняване на проблемите, и недопускане на влошаването на обстоятелствата по пътищата и в населените места.",
                "_ownerId": "1",
                "category": "4",
                "region": "6",
                "_createdOn": 1700987332000,
                "_updatedOn": 1700987542000
            },
            "12450": {
                "title": "ОКОНЧАТЕЛНО: Бедствено положение на територията на Силистра, затварят училища и пътища",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/321719809fe2da2597a82aa169ab122d.webp",
                "article": "При свиканото заседание на Общинския кризисен щаб, с председател кметът на общината г-н Александър Сабанов, е взето решение за обявяване на бедствено положение на територията на цялата община Силистра. Пътищата в областта са затворени за движение на всички моторни превозни средства, с изключение на автомобилите със специален режим на движение и на почистващи машини. Всички училища на територията на община Силистра утре, 27.11.2023 г. ще са затворени и денят ще е неучебен.",
                "_ownerId": "1",
                "category": "17",
                "region": "5",
                "_createdOn": 1700987764000,
                "_updatedOn": 1700987878000
            },
            "12451": {
                "title": "Премиерът свика извънредно съвещание заради зимната обстановка",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/63a19432d914ad9504ff1de4caa02f2a.webp",
                "article": "Премиерът акад. Николай Денков свиква извънредно съвещание в Министерския съвет днес в 11:30 часа във връзка с тежката зимна обстановка в страната и бедственото положение в няколко области, съобщиха от правителствената пресслужба. В срещата на живо и онлайн ще се включат министрите на вътрешните работи, на енергетиката и на отбраната, главният секретар на МВР, началникът на отбраната, ръководствата на ГД „Пожарна безопасност и защита на населението“ и Агенция „Пътна инфраструктура“, и областни управители.",
                "_ownerId": "1",
                "category": "22",
                "region": "3",
                "_createdOn": 1700991688000,
                "_updatedOn": 1700991688000
            },
            "12452": {
                "title": "1110 снегопочистващи машини обработват републиканските пътища. Шофирайте внимателно!",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/e927b05bf1baf66eee86ae9933373984.webp",
                "article": "Днес, 1110 снегопочистващи машини активно участват в обработката на пътищата по републиканската пътна мрежа в България. Автомагистралите, най-натоварените направления на първокласните и второкласните пътища, както и проходите, свързващи Северна и Южна България, са в приоритет. Преминаването на всички моторни превозни средства през Старопланинските проходи \"Република\", \"Троянски\", \"Шипка\", \"Котленски\" и \"Ришки\" е ограничено. Поради силни метеорологични условия, снеговалеж и снегонавявания, преминаването на тежкотоварни камиони с тегло над 12 тони през проходите \"Превала\" и \"Рожен\" е също затруднено. Временно е ограничено движението на всички моторни превозни средства в областите Разград, Силистра и Добрич, с изключение на път I-9 Дуранкулак - Варна. Ограничени са и камионите с тегло над 12 тона по първокласния път. В област Шумен са затворени за всички превозни средства път I-2 Русе - Варна, път II-27 Нови пазар - Балчик и път I-7 от Велики Преслав до Върбица. В област Смолян движението на автомобили с ремаркета и полуремаркета е ограничено поради силния вятър и снегонавявания. През последната нощ се регистрираха множество сигнали за паднали дървета в областите Враца, Велико Търново, Габрово и Разград. Екипи работят по отстраняването им. Агенция \"Пътна инфраструктура\" призовава водачите да карама с повишено внимание и съобразена скорост, да спазват необходимата дистанция и да избягват резки маневри. Блокирането на движението от превозни средства, които не са подготвени за зимни условия, създава затруднения за всички участници в пътното движение и за работата на снегопочистващата техника. Гражданите и транспортните фирми могат да получат информация за актуалната пътна обстановка и зимното поддържане на републиканската мрежа от интернет страницата на АПИ - www.api.bg, както и по всяко време от денонощието на телефон 0700 130 20 в АПИ. Ситуационният център работи целогодишно в 24-часов режим, събирайки и обобщавайки данни за състоянието на републиканските пътища.",
                "_ownerId": "1",
                "category": "21",
                "region": "2",
                "_createdOn": 1700992196000,
                "_updatedOn": 1700992684000
            },
            "12453": {
                "title": "Всички училища в област Силистра остават затворени в понеделник, заради обилния снеговалеж и силни ветрове",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/99ae7ec600b973542f7f4fd67824ecce.webp",
                "article": "Всички училища в област Силистра остават затворени в понеделник, 27 ноември, поради лоши метеорологични условия, съобщават от областното управление. Снеговалежите и поривите на вятъра създават рискове за безопасността на учениците, поради което образователният процес е преустановен за деня. Обхванати от решението са общините Силистра, Дулово, Главиница, Ситово, Тутракан и Кайнарджа. Въпреки затворените училища, детските градини и ясли в тези общини ще продължат да работят по обичайния начин. От общините в региона съобщават за снеговалежи достигащи до 50 сантиметра в някои части, което е довело до паднали дървета и прекъсвания на електрозахранването. В момента се работи усилено по отстраняването на щетите. Не е известно кога точно ще бъде възстановена нормалната инфраструктура. За повече информация и актуализации следете нашия сайт.",
                "_ownerId": "1",
                "category": "8",
                "region": "6",
                "_createdOn": 1700999114000,
                "_updatedOn": 1700999114000
            },
            "12454": {
                "title": "Кметът на Силистра - Александър Сабанов лично следи зимна обстановка в общината",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/1cbff5955cde13058bb220ea874e1e30.webp",
                "article": "Силистра се изправи срещу силен снеговалеж и ветрове, които предизвикаха аварии и проблеми през изминалата нощ и днес през деня. Кметът Александър Сабанов активно следи и координира общинските служби отговорни за справяне със зимната криза. Всички общински структури са мобилизирани за навременно справяне с последиците от стихията. Общината работи в тясно сътрудничество с местната полиция, Регионалната дирекция „Пожарна сигурност и отбрана на населението“ и електроразпределителното дружество, за да гарантира безопасността и комфорта на жителите. Досега са получени над 100 сигнала за аварийни ситуации. Кметът Сабанов призовава гражданите да останат внимателни и да избягват ненужни излизания от домовете си до възстановяването на инфраструктурата. Той увери, че общината ще предприеме всички необходими мерки за справяне със зимната буря и подпомагане на засегнатите от нея.",
                "_ownerId": "1",
                "category": "6",
                "region": "5",
                "_createdOn": 1700999564000,
                "_updatedOn": 1700999754000
            },
            "12455": {
                "title": "Община Ситово обяви бедствено положение",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/74c57d7a0e767feb0bccdbb4c3c6aba2.webp",
                "article": "В резултат на усложнената метеорологична и пътна обстановка, както и прекъсванията на електрозахранването в Община Ситово, кризисният щаб на общината обяви бедствено положение. Поради тези условия, 27 ноември 2023 г. е определен като неучебен ден за всички детски и учебни заведения в общината. Общинските власти в цяла област Силистра призовават жителите да останат информирани и да не предприемат излишни пътувания.",
                "_ownerId": "1",
                "category": "22",
                "region": "4",
                "_createdOn": 1701001027000,
                "_updatedOn": 1701001027000
            },
            "12456": {
                "title": "ИСТИНСКАТА ЗИМА: Силните снеговалежи блокираха страната",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/1dd9883ca70d9fada1b3b6c8a7d215a7.webp",
                "article": "След обилния снеговалеж, затрудненията в движението се усещат навсякъде в страната. Стотици места останаха без електрозахранване, а в някои региони липсва и вода. Някои от проходите в Стара планина са непроходими, като едно семейство беше блокирано в колата си близо до прохода „Шипка“. В района на Североизточна България снегонавяванията предизвикват проблеми. В област Враца, снежната покривка достига около 10 см, а силен вятър образува високи снежни възвишия. Падащите дървета блокираха обходен път от Враца към Борован и Бяла Слатина, като се очаква ситуацията да се нормализира в късния следобед. В област Добрич, обстановката е още по-тежка със силни снегонавявания, които оставиха над 130 села без ток и 30 без вода. Пътищата към Русе и Варна са затворени, а видимостта е изключително ниска, което води до пълна блокада на пътищата. На изходите на областния град са организирани контролно-пропускателни пунктове, като към момента няма сигнали за бедстващи или закъсали автомобили. Пътят към Бяла и София е затворен. Дълга колона от тирове се е образувала по единствения отворен път към „Дунав мост“. В Русе, основните булеварди са почистени, и градският транспорт функционира частично, въпреки че има проблеми с тролейбусните жици и паднали клони. В Старозагорско, бездомник загина в Казанлък от студа, като това е първата официална жертва на зимата. Семейство с деца беше блокирано в колата си близо до прохода „Шипка“, но по-късно беше спасено. Проходът „Шипка“ остава затворен, като множество автомобили продължават да бъдат блокирани там. В област Монтана, въпреки че проходът „Петрохан“ е отворен за движение, преминаването по него продължава да създава предизвикателства за пътуващите, особено след като снегорин аварира и причини задръстване. Възстановяването на електрозахранването е в процес, като общо 44 машини работят по почистването на пътищата в областта. За прохода „Петрохан“ са изпратени 8 снегорина и допълнително роторно оборудване. В областите Силистра и Разград, всички пътища са затворени, като полицейски патрули контролират преминаването на превозни средства. Съдействие е оказано на медицински екипи за достигане до болни хора в Разградско, където са евакуирани 9 души, пътували в три различни автомобила. Главният път Е-70 Русе – Шумен е затворен, като са поставени контролно-пропускателни пунктове. Повече от 80% от населените места са без електричество, което затруднява водоснабдяването. В област Шумен, евакуирани са две деца и игуменът на манастир близо до град Велики Преслав, тъй като всички пътища в областта са непроходими. Във Варна, пожарна екипи с помощта на верижна бойна машина извършват евакуация на 20 души, заседнали в автомобилите си на пътя над Аксаково. В региона над 100 населени места са без електричество и 30 без достъп до вода. Затворени са няколко пътища, включително Аксаково – Добрич и Аксаковска панорама – с. Кичево. В област Кюстендил, населени места в няколко общини са без ток. Пътят за ГКПП \"Гюешево\" е затворен за тежкотоварни автомобили, като пътищата са мокри и заснежени, но остават проходими при зимни условия. Поради изключително тежките зимни условия, които се наблюдават в цялата страна, силно ви призоваваме да избягвате пътуванията, освен ако не са абсолютно необходими. Обилният снеговалеж и силните ветрове създават сериозни рискове за безопасността на пътя. Моля, останете в безопасност и следвайте всички актуални препоръки от местните власти. Бъдете отговорни и внимателни. Здравето и безопасността на всеки един от вас са наш приоритет.",
                "_ownerId": "1",
                "category": "19",
                "region": "8",
                "_createdOn": 1701001665000,
                "_updatedOn": 1701001803000
            },
            "12457": {
                "title": "Радиационният фон в България остава в норма въпреки съобщения за повишение в Румъния",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/b75e30c62c64c877db776370bf1f00af.webp",
                "article": "По последни данни, измервателните станции в България, включително тези около АЕЦ \"Козлодуй\", показват, че радиационният фон е в рамките на нормалните стойности за естествения гама фон. Според Агенцията за ядрено регулиране (АЯР), това се съобщава в отговор на медийни публикации за повишение на радиационния фон в една от измервателните станции в Румъния. Изпълнителният директор на АЕЦ \"Козлодуй\" Валентин Николов е заявил, че в България не е отчетено повишение на радиационния фон и предположил, че може да има технически проблем с румънската измервателна станция, свързан с медийните публикации. Повишени показания за гама фон бяха отчетени в Румъния - 1,5 и 1,75 микросиверт в час вечерта на предния ден, което е около 10 пъти над естествения гама фон, но в същия район две други станции показват нормални стойности. АЯР счита, че най-вероятно причината за завишените показания е недостоверност в измерените стойности или технически проблем, тъй като няма данни за повишение на радиационния фон от съседните станции【40†source】.",
                "_ownerId": "1",
                "category": "23",
                "region": "1",
                "_createdOn": 1701036517000,
                "_updatedOn": 1701036517000
            },
            "12458": {
                "title": "Силна зимна буря остави без ток стотици хиляди в Североизточна България",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/e2b4885d43de6fc84f8eb0688df46cd7.webp",
                "article": "На 26 ноември, Североизточна България се сблъска с един от най-сериозните предизвикателства на инфраструктурата си за последните години - обилният снеговалеж и силните ветрове предизвикаха масивни аварии в електроразпределителната мрежа. Непрекъснатата работа на над 100 аварийни екипа на Електроразпределение Север беше насочена към бързото възстановяване на електрозахранването на около 196 хиляди клиенти в 799 населени места. Труднопроходимите пътища и обледените електропроводи, заедно с падналите дървета, добавиха допълнително усложнение към усилията на екипите, докато те се бориха с елементите. Въпреки условията, които много оприличиха на безпрецедентни, решителността и посветеността на служителите не оставиха място за колебание. Възникналият проблем също така затрудни достъпа до денонощния телефонен център на ЕРП Север, където голям брой клиенти се опитваха да подадат сигнал за авария. В този момент на национално изпитание, усилията за координация между ЕРП Север, кризисните щабове на ЕСО и местната власт се оказаха от съществено значение за навременното реагиране на ситуацията. Компанията продължава да работи неуморно за отстраняване на авариите и възстановяване на нормалното електрозахранване, подчертавайки ангажимента си към клиентите и обществото дори в най-трудните времена.",
                "_ownerId": "1",
                "category": "23",
                "region": "2",
                "_createdOn": 1701036933000,
                "_updatedOn": 1701037162000
            },
            "12459": {
                "title": "Магията на театъра оживява за децата в Силистра с представлението 'Островът на изненадите",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/7bc1a874e9282b373b4c4b819b6652e4.webp",
                "article": "На скорошно събитие в Регионална библиотека \"Партений Павлович\" в Силистра, множество деца бяха очаровани и вдъхновени от представлението \"Островът на изненадите\". Спектакълът разкрива историята на трима смели приятели - Алекс, Лили и Алекс, които се отправят към един необикновен остров. По пътя си те преодоляват множество препятствия с помощта на приятелството и смелостта си. В кулминацията на приключението си на острова, децата откриват изненади, срещат се с приказни герои, участват в игри и танци, и стават част от кралски купон. Този вълнуващ спектакъл е създаден от екип от талантливи артисти, включително Маргарита Петкова, Здравка Кантарева и Милена Великова, които умело комбинират елементи от литературата, театъра, музиката и приложното изкуство, за да предоставят на малките зрители едно незабравимо и стимулиращо изживяване.",
                "_ownerId": "1",
                "category": "23",
                "region": "5",
                "_createdOn": 1701037093000,
                "_updatedOn": 1701037093000
            },
            "12460": {
                "title": "Прогноза за времето в област Силистра: Студено, но слънчево",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/5b0a1b3b47f62b7abdb950b16a76dfd5.webp",
                "article": "В понеделник, над област Силистра, ще преобладава променлива облачност, като ще намалява до предимно слънчево време. Жителите на региона ще посрещнат деня с отрицателни температури и заледени улици, което налага внимание при придвижване. Вятърът ще бъде умерен, временно силен, духащ от запад. Максималните дневни температури се очаква да останат в рамките на 0° до 2°С, което поддържа зимния характер на времето. Валежи не се предвиждат, което е добра новина за тези, които планират външни дейности. Към вечерта, вятърът ще се ориентира от югозапад и ще отслабне, а облачността отново ще започне да се увеличава. Тази промяна предвещава, че в следващите дни може да очакваме различно от днешното време.",
                "_ownerId": "1",
                "category": "3",
                "region": "1",
                "_createdOn": 1701065441000,
                "_updatedOn": 1701065441000
            },
            "12461": {
                "title": "Вдъхновяваща история от Ню Йорк: Последният жест на доброта на Кейси Макинтайър",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/451d1ed0f2a8ed431204eda135f96d7e.webp",
                "article": "В Ню Йорк, сърцето на суматохата и безкрайната енергия, разказът на Кейси Макинтайър се откроява като истински пример за надежда и човечност. Кейси, 38-годишна жителка на Бруклин, се изправила пред едно от най-големите предизвикателства в живота - битката с рак на яйчниците. Но въпреки тежката си диагноза, тя намерила начин да остави траен отпечатък на доброта и състрадание. С помощта на организацията RIP Medical Debt, Кейси организирала кампания, която имала за цел да облекчи бремето на медицинските дългове за стотици хора. Тя умишлено избрала да остави нещо повече от спомените за нея - един последен жест на доброта, който променя животите на мнозина. Нейната история e символ на надежда и вдъхновение за местната общност. Въпреки личната си борба, Кейси показала, че състраданието и желанието да помагаме на другите може да надмогне дори най-тежките предизвикателства. Инициативата й подчертава важността на съпричастността и силата на човешкия дух. Кейси Макинтайър може и да не е сред нас, но нейният пример продължава да вдъхновява и да припомня, че всеки от нас може да направи разлика. В свят, където често сме заобиколени от негативизъм, историята на Кейси свети като фар в мрака, напомняйки ни за безкрайната доброта, която все още съществува в света.",
                "_ownerId": "1",
                "category": "10",
                "region": "3",
                "_createdOn": 1701065731000,
                "_updatedOn": 1701065731000
            },
            "12462": {
                "title": "Историята на Фини: Верният спътник, който оцеля след трагедия в планините",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/06986396f4938700c3e7d04c6aba2802.webp",
                "article": "В малкото градче Пагоса Спрингс, Колорадо, една от най-трогателните истории на верност и оцеляване. 71-годишният Рич Мур загубил живота си от хипотермия по време на изкачване в планините Сан Хуан през август, оставяйки зад себе си не само семейството си, но и своя верен четириног приятел - джак ръсел териера Фини. Историята на Фини, която остава до своя стопанин повече от 10 седмици след неговата смърт, трогна сърцата на мнозина. Малкото куче било открито живо от ловец на 30 октомври, което било истинско чудо, тъй като Фини загубила около половината от теглото си и била в лошо здравословно състояние. Сега Фини е в безопасност, върнала се при своето семейство и дори отново бяга по планинските пътеки. \"Фини се справя добре\", споделя съпругата на Мур, Дана Холби. \"Тя почти напълно си възвърна теглото и силата. Тя е наистина чудотворно куче.\" Въпреки че Фини има нараняване на муцуната, което може да остави белег, тя се възстановява добре и е изключително привързана към Холби. \"Тя е много привързана и не ме изпуска от поглед\", разказва Холби. \"Нейният голям апетит вече се уталожи, но в началото тя не можеше да получи достатъчно храна и искаше да яде по всяко време на деня и нощта.\" Фини стана известна на местните планински пътеки. Хората често питат: \"Това ли е Фини?\", на което Холби отговаря с ентусиазъм \"Да!\" Фини е голяма утеха и чудесен спътник на Холби по време на разходките, като изминават по четири-пет мили на ден. Историята на Фини е повече от вълнуваща. Тя е доказателство за необикновената връзка между човека и неговия верен кучешки спътник, за силата на верността и волята за оцеляване. \"Знам, че тя бе с Рич до самия край и по някакъв начин това трябва да е утеха. Не знам как го постигна, но тя беше там, когато той я е имал нужда\", казва Холби.",
                "_ownerId": "1",
                "category": "6",
                "region": "1",
                "_createdOn": 1701066359000,
                "_updatedOn": 1701066359000
            },
            "12463": {
                "title": "Снежната обстановка доведе до ограничения в движението и трудности в няколко области на страната",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/364e6ece0e4dce4cc3c78871e5baa3d1.webp",
                "article": "Движението през Прохода на Републиката е временно ограничено за автомобили над три тона и половина, съобщават от Областната дирекция на МВР в Стара Загора, поради зимни условия и интензивни снеговалежи. Ситуацията се усложнява още повече в региона на Велико Търново, където от снощи са блокирани 10 автобуса с хора заради снега. Пътниците са принудени да прекарат нощта в автобусите си, докато условията позволят безопасното им продължаване на пътуването. На 26 ноември, поради зимните условия, движението беше ограничено на много ключови пътни артерии в страната, включително в областта на Стара Загора. Проходите \"Хаинбоаз\" и \"Шипка\" бяха затворени за движение през по-голямата част от деня, което затрудни пътуването в региона. Освен това, множество населени места останаха без електричество заради тежките метеорологични условия, които предизвикаха аварии в електропреносната мрежа. Екипите на електроразпределителните дружества работят усилено за възстановяване на захранването. Тези усложнения показват сериозността на зимните условия в страната и налагат повишено внимание и предпазливост от страна на шофьорите и пътниците. Властите призовават гражданите да следят актуалната пътна обстановка и да избягват пътувания при лоши метеорологични условия.",
                "_ownerId": "1",
                "category": "5",
                "region": "2",
                "_createdOn": 1701067234000,
                "_updatedOn": 1701067234000
            },
            "12464": {
                "title": "Усложнената обстановка спира учебния процес в 280 училища в страната",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/ddfe10e295c79e205d59379990c87d86.webp",
                "article": "Учениците от над 280 училища в тринадесет области на страната няма да присъстват на училище в понеделник поради усложнената обстановка в регионите. Решението за прекъсване на учебния процес е взето след като лошите метеорологични условия предизвикаха множество проблеми, включително липса на ток, прекъснат интернет, скъсани електропроводи и непроходими пътища. Разпореждането за спирането на учебния процес е взето от областни кризисни щабове, областни управители и кметове на общини в отговор на извънредните условия. Най-сериозно засегната е област Добрич, където в 67 училища от осем общини ще бъде прекъснат учебният процес. Сред засегнатите общини са Балчик, Генерал Тошево, Добрич, Добричка, Каварна, Крушари, Тервел и Шабла. В Шуменския регион, учебен ден няма да има в 45 училища от десет общини, включително Шумен, Хитрино, Смядово, Нови пазар, Никола Козлево, Каспичан, Каолиново, Върбица, Венец и Велики Преслав. Също така, в Разградска област са затворени 53 училища в седем общини – Завет, Исперих, Кубрат, Лозница, Разград, Самуил и Цар Калоян. Поради обявеното бедствено положение, е възможно учениците да не се върнат на училище и във вторник.",
                "_ownerId": "1",
                "category": "22",
                "region": "5",
                "_createdOn": 1701067369000,
                "_updatedOn": 1701067369000
            },
            "12465": {
                "title": "Американски военен кораб освободи танкера „Сентрал парк“",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/b570eb7ab434460a9833360868a58f0c.webp",
                "article": " Свързаният с Израел кораб „Сентрал парк“ е в безопасност след като беше задържан в близост до бреговете на Йемен. Американски военноморски сили са отговорили на сигнал за бедствие от търговския танкер в Аденския залив, който беше атакуван и превзет от въоръжени лица. След намесата на военния кораб, танкерът е освободен и е в безопасност, съобщиха американските служители. Според информацията на вестник „Гардиън“, танкерът е бил превозващ фосфорна киселина и е бил идентифициран като \"Сентрал парк\" от компанията собственик на плавателния съд. Длъжностните лица не са разкрили самоличността на нападателите. Този инцидент е част от поредица нападения във водите на Близкия изток, настъпили след началото на войната между Израел и \"Хамас\" на 7 октомври. Предишен случай включваше завземането на друг свързан с Израел товарен кораб от йеменските хути, съюзници на Иран, в южната част на Червено море. Хутите, които изстреляха балистични ракети и въоръжени безпилотни самолети по Израел, обещаха да насочат атаки срещу допълнителни израелски кораби. „Сентрал парк“, малък танкер за химикали, се управлява от Zodiac Maritime Ltd – международна компания за управление на кораби със седалище в Лондон, притежавана от израелското семейство Офер. Корабът, плаващ под либерийски флаг, е собственост на Clumvez Shipping Inc, показват данни на London Stock Exchange Group. На борда на танкера се намират и двама български моряци като част от екипажа.",
                "_ownerId": "1",
                "category": "20",
                "region": "4",
                "_createdOn": 1701067470000,
                "_updatedOn": 1701067639000
            },
            "12466": {
                "title": "БЕЗПРЕЦЕДЕНТНО: Мъж от Калипетрово си направи сандвичи за закуска в офиса на Енергото",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/29aa331feecb42dfc79cdec9cc62b813.webp",
                "article": "Читатели на \"ПОРТАЛ СИЛИСТРА\" изпратиха видео на безпрецедентна ситуация и опит за \"наказване\" на ЕНЕРГО ПРО в Силистра. Причината е липсата на ток повече от 24 часа в село Калипетрово. Мъж на около 40 години, посещава офиса на електроразпределителното дружество преди час с голям хартиен плик пълен с хляб, дъски за рязане, ножове и мини фурна за печене. Двамата охранители правят жалък опит да спрат гладния човечец, но той категорично заявява, че няма да напусне сградата докато не приготви закуска за себе си и семейството си и иска от тях да му предоставят разклонител. След, като не получава такъв, той демонстративно спира системата за теглене на билет за ред от контакта и пуска фурничката, която си е донесъл. \"Водещият\" на кулинарното предаване е дотолкова изнервен, че заедно с оператора, който го снима, канят при тях и кметът на Калипетрово, за да закусват заедно, въпреки, че осъзнават, че той няма фактическа вина за липсата на ток, но пък го обвиняват за непочистените улици в селото. След серия викове и крясъци изведнъж началника на ЕНЕРГО ПРО чрез служителка уведомяват развилнелия се мъж, че до час и половина ще имат ток на адреса където живее. Минута по-късно влиза екип от полицаи, които молят главният герой да предостави личната си карта, с което видеото приключва. Очаквайте подробности!",
                "_ownerId": "1",
                "category": "21",
                "region": "6",
                "_createdOn": 1701077142000,
                "_updatedOn": 1701078163000
            },
            "12467": {
                "title": "Община Силистра се бори с последиците от зимния снеговалеж",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/a250394744529eed6f518253ca2d3b27.webp",
                "article": "В резултат на тежките зимни условия, община Силистра се справя със сериозни предизвикателства, включително почистването на пътищата и отстраняването на паднали дървета, които причиниха щети по електропреносната мрежа. Според информация, публикувана на официалната страница на общината, всички основни пътни артерии на територията на общината са почистени и проходими въпреки тежките зимни условия. Според кмета на община Силистра, г-н Александър Сабанов, основният проблем за нормализиране на обстановката са изпочупените дървета, много от които са нанесли сериозни щети по електропреносната мрежа. Това е довело до липса на електрозахранване в редица населени места. Работата на аварийните екипи продължава с цел възстановяване на електроподаването във всички села в общината. В неделя, въпреки трудностите, бяха почистени всички пътища на територията на община Силистра, включително и всички села. Още вчера следобед беше отворен пътят Силистра-Русе, а сутринта - пътищата Силистра-Шумен и Силистра-Добрич. Общинската фирма „Синева“ продължава да почиства града и тротоарните настилки, като се уверява, че пътищата са обработени със сол и пясък, за да се предотвратят поледици. Кметът Сабанов споделя, че са паднали над 200 дървета, които са пречели на снегопочистващата техника и са трябвали да бъдат нарязани и извозени. Общината поддържа постоянна връзка с Енерго Про, като се работи усилено за възстановяване на електрозахранването във всички засегнати райони. На територията на общината водоснабдяването също е засегнато от липсата на ток, но се очаква да бъде възстановено след като електрозахранването бъде нормализирано. Общината уверява гражданите, че се полагат всички усилия за възстановяване на нормалното функциониране на услугите във възможно най-кратки срокове.",
                "_ownerId": "1",
                "category": "20",
                "region": "7",
                "_createdOn": 1701096127000,
                "_updatedOn": 1701099761000
            },
            "12468": {
                "title": "ВИДЕО: Глобиха Явор, който си направи сандвичи за закуска в Енергото",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/e2b5eae78ed416b00c67cca03c989e37.webp",
                "article": "\"ПОРТАЛ СИЛИСТРА\" се свърза с човекът който стоеше зад телефона и излъчваше пряко във Фейсбук \"кулинарното предаване\" в сградата на \"ЕНЕРГО ПРО\" тази сутрин в Силистра, от който научи допълнителна информация за случая. Припомняме, че калипетренецът Явор Павлов направи безпрецедентен протест затова, че в силистренското село Калипетрово където живее, повече от 24 часа е нямало ток. Той си спретна бърза закуска от сандвичи, закоето е бил глобен от полицаите с акт за дребно хулиганство. Интересен е обаче крайния резултат, а той е че 30 минути след стъпването му в сградата и обявения протест, токът е до неговата къща е бил пуснат. Видеото му е гледано над 1.5 млн. пъти във Фейсбук, споделено е над 28 000 пъти, събрало е над 25 000 реакции и е коментирано от над 15 000 потребители на социалната мрежа. В случай, че сте го пропуснали, може да го гледате тук: ",
                "_ownerId": "1",
                "category": "4",
                "region": "4",
                "_createdOn": 1701098985000,
                "_updatedOn": 1701099291000
            },
            "12469": {
                "title": "Учебният процес в Силистра и Тутракан се подновява от утре",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/2af036a43c132a66d5356375309f8aff.webp",
                "article": "Във връзка с неблагоприятните метеорологични условия, учебните занятия утре, 28 ноември, ще се проведат единствено в общините Силистра и Тутракан. В останалите общини в областта, занятията ще бъдат отменени. Това решение е взето предвид продължаващото лошо време, което се очаква да продължи и в следващите дни. В община Главиница, бедственото положение е отменено частично. Въпреки предизвикателствата, в Силистра и Тутракан учебният процес ще протече според утвърдения график.",
                "_ownerId": "1",
                "category": "17",
                "region": "7",
                "_createdOn": 1701100145000,
                "_updatedOn": 1701100145000
            },
            "12470": {
                "title": "ВИДЕО: Борислав Михайлов подаде оставка като президент на Българския футболен съюз",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/1ba1d07b1fcddb80c45cea17dcbe3566.webp",
                "article": "Президентът на Българския футболен съюз (БФС), Борислав Михайлов, обяви своята оставка по време на заседанието на Изпълнителния комитет на федерацията. \"За да са спокойни всички, подадох оставка\", заяви Михайлов на пресконференция, уточнявайки, че неговото оттегляне не е било искано от нито един футболен клуб. Михайлов подчерта своите усилия по време на ръководството си, включително развитието на система за млади таланти и инвестиции в българското първенство. Отбеляза, че са въведени в експлоатация 19 нови терена и че организационната структура на БФС е била обновена. Борислав Попов, изпълнителен директор на БФС, информира за процедурата по избор на нов президент. Следващото заседание на Изпълкома, на което ще бъде уточнен дневният ред за Конгреса, е насрочено за 6 декември. „На 6 декември ще бъде свикано ново заседание на Изпълкома, на което ще бъдат приети дневен ред, място и дата на предстоящия Конгрес, който явно ще се състои следващата година. Технологичното време е минимум два месеца. Към днешна дата клубовете, които ще се съберат, са 540”, каза Попов. Михаил Касабов временно поема ръководството на БФС, след като Емил Костадинов отказа да заеме поста​. ",
                "_ownerId": "1",
                "category": "17",
                "region": "1",
                "_createdOn": 1701101515000,
                "_updatedOn": 1701101578000
            },
            "12471": {
                "title": "Дулово с богата празнична програма през декември: От изложби до коледни концерти",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/2a95dad0fc4696d6b7c8ce840588008f.webp",
                "article": "Община Дулово обяви богата и разнообразна програма за предстоящите празници през декември, предназначена за хора от всички възрасти и с различни интереси. Събитията започват на 7 декември с патронния празник на Народно читалище \"Н. Й. Вапцаров-1895\", където ще бъдат отчетени и наградени участници в конкурс за рисунка, стихотворение и есе на тема \"Вярата, без която не можем\". На 8 декември ще се състои запалването на коледната елха на площад \"Единство\". От 12 до 22 декември във фоайето на общината ще има изложба от коледни картички, а от 19 до 22 декември - Коледен благотворителен базар на открито. На 20 декември ще бъде представен коледен концерт на самодейни състави към читалището, а на 31 декември - Новогодишна наздравица",
                "_ownerId": "1",
                "category": "16",
                "region": "4",
                "_createdOn": 1701150594000,
                "_updatedOn": 1701151961000
            },
            "12472": {
                "title": "Учебните занятия в Силистра и Тутракан продължават въпреки неблагоприятното време",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/65f8092a3555527c8d50f1e13c0d2b49.webp",
                "article": "На 28 ноември 2023 г., въпреки неблагоприятните метеорологични условия, учебните занятия в Силистра и Тутракан ще се проведат по обичайния график. В останалите общини в областта занятията ще бъдат отменени поради продължаващото лошо време. В община Главиница е отменено частично бедственото положение, но влиянието на неблагоприятните метеорологични условия остава",
                "_ownerId": "1",
                "category": "19",
                "region": "4",
                "_createdOn": 1701150720000,
                "_updatedOn": 1701150720000
            },
            "12473": {
                "title": "Финансовият министър предупреждава за рисковете от евентуално вето на президента Радев върху бюджета",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/4a6806bb5772fd5ebb4c5f6fb721a61c.webp",
                "article": "Финансовият министър Асен Василев изрази опасенията си относно евентуално вето на президента Румен Радев върху бюджета за 2024 година. Василев заяви, че такова действие би било зле, тъй като би означавало, че страната може да влезе в новата година без закон за бюджета. Той коментира, че не е изненадан от поведението на президента и припомни, че миналата година служебният кабинет на президента не е предложил закон за държавния бюджет, което довело до седем месеца без бюджет и предложение за проектобюджет с почти 8% дефицит в опит да се възпрепятства членството на България в Еврозоната",
                "_ownerId": "1",
                "category": "21",
                "region": "2",
                "_createdOn": 1701150897000,
                "_updatedOn": 1701152125000
            },
            "12474": {
                "title": "Шофьор на тир се блъсна в снегорин, пътят бе блокиран",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/5b22cd0f71418c0389107ea4beed8e37.webp",
                "article": "Катастрофа вчера блокира пътя между Бяла Слатина и Кнежа На 27 ноември 2023 г., шофьор на тир, докато изпреварвал, изгубил контрол и се ударил в снегорин. В резултат на инцидента временно беше спряно движението на автомобили между градовете Бяла Слатина и Кнежа. Пътят остана блокиран за известно време поради катастрофата",
                "_ownerId": "1",
                "category": "5",
                "region": "8",
                "_createdOn": 1701151031000,
                "_updatedOn": 1701152477000
            },
            "12475": {
                "title": "Примирието в Газа удължено с два дни след споразумение с Катар и Египет",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/ff83b99b4e5c6ed0ddfd617f04b5dbdb.webp",
                "article": "На 27 ноември 2023 г., Катарското външно министерство обяви удължаването на примирието в ивицата Газа с още два дни, както беше предадено от Ройтерс. В социалната мрежа \"Екс\", говорител на министерството потвърди споразумението за двудневно удължение на хуманитарното примирие. Палестинската групировка \"Хамас\" също заяви, че е дала съгласието си за удължаване на примирието пред Катар и Египет, с непроменени условия. Представител на Белия дом потвърди съгласието на Израел и \"Хамас\" за удължаването на примирието, без да предоставя допълнителни детайли по въпроса",
                "_ownerId": "1",
                "category": "1",
                "region": "6",
                "_createdOn": 1701151134000,
                "_updatedOn": 1701151134000
            },
            "12476": {
                "title": "БАБХ откри ново огнище на инфлуенца по птиците в Генерал Тошево",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/a0d6c61c88ab4e687128530cffff5f82.webp",
                "article": "На 27 ноември 2023 г., Българската агенция по безопасност на храните (БАБХ) идентифицира ново огнище на инфлуенца А (грип) по птиците в птицеферма за отглеждане на кокошки носачки в землището на град Генерал Тошево, област Добрич. Откритието последва сигнал от собственика на фермата за наблюдавана повишена смъртност сред птиците. Фермата, в която бяха отглеждани около 129 хиляди кокошки, беше незабавно подложена на официален надзор. Изпълнителният директор на БАБХ издаде заповед за обявяване на огнището и предприемане на необходимите мерки за контрол. Тези мерки включваха умъртвяване по хуманен начин на заболелите и контактните птици във фермата, последвано от обезвреждане на труповете, като се вземат предвид всички предпазни мерки за предотвратяване на разпространението на болестта. В отговор на тази ситуация бяха определени предпазна и наблюдавана зони около засегнатата ферма. Трикилометровата предпазна зона включваше град Генерал Тошево, а в десеткилометровата наблюдавана зона попадаха множество населени места в община Генерал Тошево, сред които с. Снягово, с. Огражден, с. Йовково и други. В тези зони бяха въведени специални процедури за епизоотично проучване, включително проследяване на движението на домашни и други птици, яйца, продукти и странични животински продукти, добити от птиците, както и на фураж за птици и свързаните с тях транспортни средства. Целта на тези мерки беше да се ограничи разпространението на вируса и да се гарантира безопасността на храните в региона. БАБХ подчерта, че птичето месо и продуктите, добити от обект, в който е установено огнище на инфлуенца по птиците, са безопасни за човешката консумация при спазване на строгите хигиенни правила за обработка на храните в домакинството",
                "_ownerId": "1",
                "category": "22",
                "region": "5",
                "_createdOn": 1701151485000,
                "_updatedOn": 1701151485000
            },
            "12477": {
                "title": "Силистренска вокална група \"ДО РЕ МИ\" постигна успех на международен конкурс",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/ee6f5535c8a6b84f201439e2e9ef697e.webp",
                "article": "На международния конкурс EURO POP CONTEST BERLINER PERLE, който се проведе в Берлин от 23 до 27 ноември 2023 г., вокалната група \"ДО РЕ МИ\" от Силистра завоюва второ място, като се състезаваха с талантливи певци от 20 страни. Този конкурс, известен още като \"малката Евровизия\", беше сцена, на която групата, включваща изпълнителите Еми, Мони, Ади, Поли и Мишо, и ръководена от Бонка Скорчелиева, представиха две песни - \"Фолклорна плетеница\" и \"Shallow\". Техните изпълнения им спечелиха престижната втора награда. Успехът на групата беше отбелязан и с благодарности към Община Силистра за осигурената финансова подкрепа, която им помогна да участват в конкурса.",
                "_ownerId": "1",
                "category": "19",
                "region": "4",
                "_createdOn": 1701152858000,
                "_updatedOn": 1701153023000
            },
            "12479": {
                "title": "Кметът на Средец Трайчо Трайков обяви плановете за демонтиране на Паметникът на Съветската армия",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/095910bb3efb17f48799ef7897afa9ac.webp",
                "article": "На 27 ноември 2023 г., Трайчо Трайков, кмет на столичния район \"Средец\" и бивш министър на енергетиката, разкри плановете за демонтиране на Паметникът на Съветската армия в София. В предаването \"Лице в лице\" по БТВ той обясни, че вече се работи активно по този въпрос и изрази надежда за скорошното осъществяване на тази инициатива. Трайков също коментира наскорошния проблем с пешеходните пътеки на улица Шишман, където се наложи смяна на плочките, водеща до създаване на объркване сред пешеходците и шофьорите. Той спомена за подадена от него молба за поставяне на \"легнали полицаи\" за по-добра организация на движението. Трайков изрази надежда, че с новото общинско ръководство и децентрализацията на процесите, подобни проблеми ще се решават по-бързо и ефективно.",
                "_ownerId": "1",
                "category": "16",
                "region": "4",
                "_createdOn": 1701153678000,
                "_updatedOn": 1701153678000
            },
            "12480": {
                "title": "Група ГРАФИТ с концерт за Световния ден за борба със СПИН",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/089bd8c8ffd93144c8b1e10d2b0b51de.webp",
                "article": "Група \"ГРАФИТ\" ще изнася концерт по случай Световния ден за борба със СПИН на 1 декември в зрителната зала на Младежкия дом в Силистра. Събитието, част от програмата за превенция сред младежките групи, е организирано от Регионалната здравна инспекция, Община Силистра, Общински съвет по наркотични вещества и Превантивен информационен център по зависимости. Световният ден за борба със СПИН се отбелязва от 1988 година, а мотото за тази година, зададено от Световната здравна организация, е \"От теб зависи\"",
                "_ownerId": "1",
                "category": "17",
                "region": "6",
                "_createdOn": 1701153832000,
                "_updatedOn": 1701153832000
            },
            "12481": {
                "title": "ЕНЕРГО-ПРО осъжда агресивните действия на Явор след инцидента с прекъсване на тока",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/5a3fdf407b6b3004a1797b24a54e973a.webp",
                "article": "На 27 ноември 2023 г., двама мъже от село Калипетрово, Силистра, извършиха акт на протест, като нахлуха в сградата на ЕНЕРГО-ПРО и опитаха да си направят сандвичи, изразявайки недоволство от липсата на ток в домовете им в продължение на 24 часа. По информация от пресцентъра на МВР, на мъжете беше съставен предупредителен протокол, а случаят беше доведен до вниманието на прокуратурата. Прокуратурата разглежда инцидента и се предполага, че може да последват действия срещу двамата мъже. В отговор на това, ЕНЕРГО-ПРО издаде официална позиция, осъждайки действията на мъжете. В изявлението си, компанията подчерта, че поведението на мъжете е било недопустимо, като се отбелязва тежката метеорологична обстановка, която е причинила стотици аварии в електрическата мрежа на Североизточна България. Според ЕНЕРГО-ПРО, клиентът се държал арогантно, притеснявайки служителките в корпоративния офис и затруднявайки тяхната работа с други клиенти в извънредна ситуация. Органите на МВР са били незабавно сигнализирани, като при посещението си на място са снели личните данни на клиента. Компанията съобщава, че планира да внесе жалба в Прокуратурата за вандалското поведение на въпросния клиент. ЕНЕРГО-ПРО обяснява, че липсата на електрозахранване в дома на клиента се дължи на множеството аварии, причинени от тежката метеорологична обстановка през предходния ден​ Ако сте го пропуснали, видеото можете да видите тук: https:\/\/www.portal-silistra.eu\/news\/12466",
                "_ownerId": "1",
                "category": "3",
                "region": "5",
                "_createdOn": 1701155856000,
                "_updatedOn": 1701155856000
            },
            "12482": {
                "title": "Необичайният протест в Силистра: Какво имаше да каже Явор пред Нова ТВ",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/39f2370639d766a201a126f955c628c5.webp",
                "article": "В понеделник, Явор Павлов от село Калипетрово, Силистра, предприе нестандартна форма на протест, като нахлу в офиса на електроразпределителното дружество в Силистра, носейки със себе си парти грил, за да си препече филии за закуска. Поводът за неговите действия беше, че повече от 24 часа домът му е бил без ток и никой не отговарял на дежурните телефони на компанията. Целият инцидент беше заснет и качен в социалните мрежи, събирайки около 3 милиона гледания. Видеоклипът показва как Павлов влиза в офиса на ЕНЕРГО-ПРО, носейки скара, дъска за рязане, хляб, колбас и дори компот. Охраната на офиса опитва да го спре, но той отказва да си тръгне. Впоследствие Павлов, който описва себе си като спокоен човек и собственик на сервиз, обяснява, че е избрал този начин на протест, защото според него това е ефективен начин да се чуе гласът му. Той твърди, че протестът е необходим, тъй като \"ако си стоим вкъщи, нищо няма да се оправи\", но не смята, че е прекалил с действията си. Павлов беше задържан за няколко часа и му беше съставен акт. От ЕНЕРГО-ПРО са в процес на подаване на жалба в прокуратурата за вандалското му поведение",
                "_ownerId": "1",
                "category": "4",
                "region": "1",
                "_createdOn": 1701169970000,
                "_updatedOn": 1701175093000
            },
            "12483": {
                "title": "Ученичка от Силистра блести на Националния кръг по английски език",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/9c7e26ff4d42899e6d3bb9ceee2b011e.webp",
                "article": "Велина Мартинова Илинова, ученичка от СУ „Н.Й.Вапцаров“ в Силистра, постигна изключително представяне на Националния кръг на състезанието за речеви и комуникативни умения на английски език, проведен на 25-26 ноември в Хасково. Тя представи област Силистра, след като печели първо място на областния кръг във втора възрастова група 9-11 клас. Темата на нейната презентация беше „Изкуственият интелект – благословия или проклятие?“, където тя демонстрира впечатляващи ораторски и презентационни умения, както и владеене на английския език. Успехът на Велина е резултат от нейната системна подготовка и мотивация за победа, подкрепена от нейната учителка г-жа Елка Симеонова.",
                "_ownerId": "1",
                "category": "11",
                "region": "8",
                "_createdOn": 1701171475000,
                "_updatedOn": 1701171508000
            },
            "12484": {
                "title": "ОБНОВЕНА: Ученици от ПМГ се забиха в Римската гробница с Голф",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/960256f32066e587e89800b4d4c18044.webp",
                "article": "Читатели на \"ПОРТАЛ СИЛИСТРА\" ни изпратиха снимка на лекавтомобил Фолксваген Голф, който се е забил около 15:10 часа в оградата на \"Римската гробница\" в Силистра. Към момента причините за инцидента не са ясни, както и дали има пострадали. Според очевидци на катастофата в колата е имало ученици. Съученици на шофьора разказаха, че той е 12-ти клас в ПМГ \"Св. Климент Охридски\". Има книжка от скоро. Не пие, не пуши и не употребява други субстанции. 40 минути след инцидента, колата беше изкарана от двора на римската гробница с кран. Очаквайте подробности.",
                "_ownerId": "1",
                "category": "10",
                "region": "8",
                "_createdOn": 1701177933000,
                "_updatedOn": 1701179526000
            },
            "12485": {
                "title": "БЕЗПРЕЦЕДЕНТНО: Силистренец заплаши Енергото, че ще се премести да живее там",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/2667e90679341f0be72a416faedcd2d0.webp",
                "article": "Екипът на \"ПОРТАЛ СИЛИСТРА\" попадна на интересен пост в социалната мрежа Фейсбук на силистренеца Димитър Георгиве. В него той заплашва ЕНЕРГО ПРО, че ако дежурен екип не се отзове на сигнала, който е подал два пъти за последните два дни - компрометиран бетонен стълб, който има опасност да падне върху къщата му и ако това се случи, заедно със семейството му ще се преместят в сградата на Енергото. ",
                "_ownerId": "1",
                "category": "4",
                "region": "3",
                "_createdOn": 1701178613000,
                "_updatedOn": 1701178726000
            },
            "12486": {
                "title": "Ученик от ПК “Доростол“ с второ най-добро време в Европа по плуване",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/504481f732ef11ca7de4530431d1cea0.webp",
                "article": "Дарен Кирилов, талантлив плувец от Плувен клуб “Доростол“ и ученик на СУ „Дръстър“, завоюва шампионска титла при юношите в дисциплината плуване 400 м съчетано. Това постижение го класира с второто най-добро време в европейската ранглиста към 27.11.2023 г. Треньор на Дарен е Веселин Суров, който е не само негов наставник в спорта, но и директор на СУ „Дръстър“. Дареновият успех е резултат от неговата упорита работа и постоянно усъвършенстване в спорта.",
                "_ownerId": "1",
                "category": "16",
                "region": "2",
                "_createdOn": 1701178927000,
                "_updatedOn": 1701179002000
            },
            "12487": {
                "title": "\"След сватба идва брадва\": Откраднаха луксозния автомобил на фолк певицата Юнона",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/c5a0836f7219c6f79f222128cb71ad3e.webp",
                "article": "Откраднаха луксозен автомобил в столичния квартал „Овча Купел“. Потърпевшата е поп фолк певицата Юнона. В района навсякъде има сгради, а в близост до откраднатия автомобил – и прожектор, който осветява мястото, на което колата е била паркирана. Юнона разбира, че автомобилът ѝ го няма след сигнализация на телефона. Камера пред дома ѝ проследява движенията и бързо разбира какво се случва. Преди това нейни гости пушат на терасата и я питат кога толкова бързо е успяла да прибере колата в гаража, при положение, че през цялото време е с тях. Певицата живее от осем години на този адрес, казва, че не знае за кражби на други автомобили в района през този период. \"След сватба идва брадва\", написа певицата в коментар за случилото се в профила си във Фейсбук. Юнона е шокирана от това, че крадецът е отмъкнал колата ѝ без притеснения – докато все още не се е съвсем стъмнило и при реагиращо осветление. Камерите показват, че той е бил с шапка и качулка и необезпокоен от прожекторите и камерите, я отключва и потегля. След като разбира какво се е случило, певицата веднага подава сигнал на телефон 112. От СДВР обясниха пред bTV, че към момента тече разследване по случая. ",
                "_ownerId": "1",
                "category": "10",
                "region": "7",
                "_createdOn": 1701189280000,
                "_updatedOn": 1701189501000
            },
            "12488": {
                "title": "ОТ ПОСЛЕДНИТЕ МИНУТИ: Катастрофа затвори пътя за Айдемир",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/e09be1bedb5d63aeaf7ac8ce457a1090.webp",
                "article": "Членове на най-голямата силистренска група във Фейсбук - I SEE YOU КАТ Силистра, съобщават за катастрофа станала около 18:00 часа на пътя Силистра - Айдемир. Според участници в движението, които са успели все пак да продължат по пътя си, лек автомобил Ауди А4, черно на цвят се е врязало в мантинелата на кръстовището, което води към силистренското предприятие за елеватори \"ЕЛИКА ПРОцесинг\" и \"Силома\". \"Най-вероятно автомобилът се е врязъл с висока скорост в мантинелата и от удара се е завъртял на 180 градуса в обратната посока на движение\", сподели за \"ПОРТАЛ СИЛИСТРА\", шофьор преминал през мястото на инцидента. На място има екипи на полицията и екип на спешна медицинска помощ. Не се съобщава за пострадали хора. Очаквайте подробности!",
                "_ownerId": "1",
                "category": "5",
                "region": "6",
                "_createdOn": 1701190500000,
                "_updatedOn": 1701191042000
            },
            "12489": {
                "title": "Пробив в поверителността на ТikTok излага на опасност лични данни на известни личности",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/83e7725bbb6ebc89fd8c71448a8b402e.webp",
                "article": "Статия на \"Forbes\" относно вътрешните инструменти на TikTok разкрива, че служителите на компанията лесно достигат до чувствителна информация за потребителите, включително за важни обществени фигури. Специално инструментите за социално картографиране позволяват проследяването на широки социални мрежи на потребителите, като това може да включва дори лични контакти и връзки, открити чрез синхронизиране на телефонни книги и други социални медии с приложението. Бившият главен съветник на Националната агенция за сигурност на САЩ, Глен Герстел, предупреждава, че без американски национален закон за поверителността на данните, подобни въпроси ще продължат да съществуват във всички социални медийни платформи. Той подчертава, че TikTok е особено важен заради собствеността си от китайска компания, което го прави податлив на изискванията на китайското правителство и го превръща в потенциален инструмент за дезинформация и шпионаж. Въпреки твърденията на TikTok, че няма доказателства за тези злоупотреби, Герстел изразява опасения, че достъпът до обширните социални мрежи на потребителите може да улесни китайските усилия за дезинформация и влияние, особено във времена на конфликт или високи политически залози като изборите.",
                "_ownerId": "1",
                "category": "23",
                "region": "3",
                "_createdOn": 1701192133000,
                "_updatedOn": 1701192133000
            },
            "12490": {
                "title": "Постепенно възстановяване след зимния хаос: Само три училища в България остават затворени",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/ece3a1faaddc1f5554736ed3cd5671d6.webp",
                "article": "След снежната буря, която засегна значителни части от България, аварийни екипи работиха през цялата нощ, за да възстановят електричеството в пострадалите райони. Въпреки усилията, към вчерашния следобед около 32 хиляди домакинства в Западна и Североизточна България все още бяха без ток. В отговор на усложнената зимна обстановка, повечето училища, които бяха затворени през последните два дни, вече възобновяват присъственото обучение. Изключение правят само три училища – две в област Бургас и едно в област Видин, където учебният процес остава преустановен. Освен това, в едно училище в община Лом се налага обучение от разстояние поради повреда на отоплителната инсталация",
                "_ownerId": "1",
                "category": "4",
                "region": "7",
                "_createdOn": 1701238042000,
                "_updatedOn": 1701238042000
            },
            "12491": {
                "title": "Успокоение на времето: Валежите отстъпват, а температурите в България се покачват",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/8c6650f94a22732deae4acdee757305c.webp",
                "article": "Снощи облачността остана значителна в много райони на страната, като на места се очакват валежи от дъжд. Вятърът беше умерен, временно силен, духащ от юг, с минимални температури вариращи между 3° и 8° градуса. Днес, валежите ще са епизодични и само на отделни места, като към вечерта се очаква те да спрат напълно. Облачността ще започне да се разкъсва и намалява от северозапад. Вятърът ще отслабне до умерен и ще смени посоката си от запад. Температурите ще се повишат, като максималните стойности ще варират между 7° и 12° градуса. За региона на Силистра се предвижда минимална температура от 4° и максимална от 9° градусa.",
                "_ownerId": "1",
                "category": "22",
                "region": "4",
                "_createdOn": 1701238357000,
                "_updatedOn": 1701238649000
            },
            "12492": {
                "title": "Серия от опити за кражби на автомобили по време на снежна буря",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/d3a4fd11311edc4f89c2cb4d8c6a127c.webp",
                "article": "По време на снежната буря, която остави стотици населени места в България без електричество, бе отчетен опит за кражба на автомобил. Крадците използваха този момент, когато условията се оказаха подходящи за техните действия. Красимир Стайков от град Крън открил своя автомобил с разбити прозорци и врати. Той разкри, че подобни случаи са чести, но рядко се сигнализират до полицията. Оказва се, че крадецът е успял да влезе в двора на Стайков, докато той и семейството му са били у дома, и е огледал и другите автомобили в имота. На следващата сутрин, Стайков открил своята кола със свалено предно стъкло, махнати уплътнения и разбита врата, като возилото било изпълнено със сня",
                "_ownerId": "1",
                "category": "23",
                "region": "8",
                "_createdOn": 1701238437000,
                "_updatedOn": 1701241610000
            },
            "12493": {
                "title": "Апел на кмета на Община Главиница: Да запазим спокойствие и да дадем време на аварийните екипи",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/9e2efd4c7abba9fe3804de7bf957f269.webp",
                "article": " Кметът на Община Главиница, Неждет Джевдет, информира, че авариите в електропреносната мрежа на общината все още не са отстранени. Въпреки активната комуникация с ЕРП-СЕВЕР и изпращане на сигнали за конкретни адреси, аварийните екипи още не са започнали работа по отстраняването на проблемите в населените места. Кметът добавя, че съществува увереност, че всички аварии ще бъдат отстранени, въпреки че няма конкретна информация за сроковете. Община Главиница предоставя детайлна информация за известните аварии и е уведомила ЕРП-СЕВЕР за тях, включително скъсани жици, проблеми с трансформатори и липса на електричество в някои райони. Кметът призовава жителите на общината да запазят добрия тон и да изчакат аварийните екипи да завършат своята работа",
                "_ownerId": "1",
                "category": "1",
                "region": "2",
                "_createdOn": 1701238537000,
                "_updatedOn": 1701238537000
            },
            "12494": {
                "title": "България одобрява стратегически позиции за заседания на Съвета на ЕС по Правосъдие и Вътрешни работи",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/f4b6653f41ec1879a023eb5a4a8fb4d9.webp",
                "article": "Правителството на България е одобрило националните позиции за предстоящите заседания на Съвета на Европейския съюз по \"Правосъдие и вътрешни работи\". Заседанието за \"Вътрешни работи\" ще се проведе на 8 юни 2023 г. в Люксембург. Сред обсъжданите теми ще бъдат управлението на убежището и миграцията, борбата с насилствения екстремизъм и тероризма, както и мониторинг на визовите режими​​. Допълнително, заседанието на 9 юни 2023 г. ще включва обсъждане на пет предложения за директиви, като част от формат \"Правосъдие\"​​. Някои от ключовите директиви, които България ще подкрепи, включват промени в директивите за борба с трафика на хора, отнемането и конфискацията на активи от престъпна дейност, и защитата на лица, ангажирани в участието на обществеността от стратегически съдебни производства (SLAPP)​​. Също така, страната ще внесе декларация относно неприемането на понятието \"gender\" в контекста на директива за борба с насилието над жени и домашното насилие​​, както и ще подкрепи предложение за определяне на санкции за нарушаване на ограничителните мерки на ЕС​",
                "_ownerId": "1",
                "category": "23",
                "region": "3",
                "_createdOn": 1701238753000,
                "_updatedOn": 1701238753000
            },
            "12495": {
                "title": "Успешно възстановяване на железопътното движение в страната след непредвидени усложнения",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/0d54b8822d30bd198b39d14f41c0049c.webp",
                "article": "От Националната компания за железопътна инфраструктура (НКЖИ) информираха, че движението на влаковете по главните железопътни линии в страната вече е напълно възстановено. Въпреки това, на два участъка на второстепенни линии - между Габрово и Царева ливада и между Дулово и Силистра, продължават възстановителните дейности, като се очаква те да приключат до края на деня. Емил Симеонов, главен ревизор по безопасността в НКЖИ, обясни, че вчерашните закъснения бяха причинени от обилния снеговалеж, силния вятър, липсата на ток, падналите далекопроводи и многото дървета, които попаднали върху контактната мрежа и железопътната линия. Той подчерта, че въпреки тези предизвикателства, благодарение на бързата реакция и подготовка, движението на влаковете беше нормализирано в рамките на 24 часа. От БДЖ съветват гражданите, преди пътуванията си, да проверите метеорологичните условия",
                "_ownerId": "1",
                "category": "1",
                "region": "1",
                "_createdOn": 1701238877000,
                "_updatedOn": 1701238877000
            },
            "12496": {
                "title": "България провежда национален тест на напредналата система за ранно предупреждение BG-Alert\"**",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/75823a0185869492b38abb1d2a0234b0.webp",
                "article": "В ключова стъпка към подобряване на националната безопасност, България предприема всеобхватен тест на своята новоимплементирана система BG-Alert, предназначена за ранно предупреждение при извънредни ситуации. През определен интервал между 12:00 и 12:30 ч., мобилни потребители в цялата страна, независимо от техния мобилен оператор, ще получат тестово предупреждение. Съобщението, проектирано да привлече вниманието, ще бъде изпратено със звуков и вибрационен сигнал, функция, която се активира дори когато телефонът е на безшумен режим. За да бъде инклузивно, предупреждението ще бъде двуезично, на български и английски език, като ясно ще бъде посочено, че става въпрос за тест. Получателите ще имат възможността да изключат сигнала при получаването му, демонстрирайки потребителския подход на системата. Този тест означава значителен скок в готовността на България за извънредни ситуации, отбелязвайки ключов момент в способностите на страната за управление на бедствия.",
                "_ownerId": "1",
                "category": "5",
                "region": "8",
                "_createdOn": 1701238965000,
                "_updatedOn": 1701238965000
            },
            "12497": {
                "title": "Ефективни мерки и координация след снежната буря обсъдени на заседание в Областна администрация Силистра",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/eb4ef5baac581893aeaf84141d7a4e7f.webp",
                "article": " В Областна администрация Силистра се проведе важно разширено заседание на Областен съвет за изпълнение на Областния план за защита при бедствия, в което взеха участие кметовете на общините в района. Форумът беше свикан в отговор на наскоро преминалите неблагоприятни метеорологични явления – обилни валежи на дъжд и снеговалежи, придружени от силен североизточен вятър, снегонавявания и рязко застудяване. В резултат от тези условия настъпи повреда в 110-киловолтовия далекопровод и падане на стълбове за средно напрежение. По време на заседанието бяха представени устни доклади от представители на общините и регионални структури, откъдето стана ясно, че са имали трудности с овладяването на последиците от бурята. Бяха набелязани мерки за подобрение на действията и координацията между отговорните институции при настъпване на кризи от подобен характер. Областният управител Минчо Йорданов представи на участниците в заседанието свършената работа на ниво област, която включваше взаимодействие с институциите в съседните области. Той акцентира върху решените проблеми с помощта на МВР, РС за пожарна безопасност и защита на населението, както и на кметовете на общините. В края на заседанието бе подчертана необходимостта от по-добра комуникация между кметствата и областната структура за планиране на сили и средства за решаване на проблеми при подобни природни явления. Беше даден положителен пример със село Долец, където на 4 ноември бе решена ситуацията с торнадо чрез участието на институциите и групи доброволци от общините. Обсъждана бе и темата за осигуряване на генератори за ток в кметствата и учрежденията като алтернатива за електричество. Бе подчертана и необходимостта от допълнително уточняване на възможностите за решаване на проблема с електроснабдяването.",
                "_ownerId": "1",
                "category": "17",
                "region": "1",
                "_createdOn": 1701239169000,
                "_updatedOn": 1701239169000
            },
            "12498": {
                "title": "Вавакада обявява временно изтегляне на Шишеядите",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/839193fcdb551b4c4495fc2abab6ff5e.webp",
                "article": "Ангажирани с опазването на околната среда и усъвършенстване на процесите на рециклиране, от Вавакада обявиха временното изтегляне на своите Шишеяди – специални контейнери за събиране на пластмасови бутилки. Този ход е част от усилията на стартъпа да оптимизира и подобри целия процес на рециклиране, като търси по-ефективни решения за обработка и съхранение на рециклируеми материали. За създаването и развитието на Вавакада стои местният предприемач Владислав Костов и неговата сестра- Даниела. Владо първоначално основава компанията като технологичен стартъп. Заедно, по-късно преориентират фокуса на компанията към рециклирането и 3D принтирането, отразявайки силната ангажираност на екипа към опазването на околната среда. Техният иновативен подход и посвещение бяха отличени в началото на тази година, когато спечелиха шестото издание на академията за местни предприемачи 'Rinker', където получиха безвъзмездно финансиране за своята компания. През периода на инициативата екипът на Вавакада, се сблъскали с редица предизвикателства, включително попадането на неочаквани предмети в контейнерите за рециклиране, като старо бельо и остатъци от храна, което поставя под въпрос ефективността на процеса. С цел подобряване на тази ситуация, Владо и Даниела, предприемат мерки за усъвършенстване на своята система. Въпреки временното премахване на контейнерите, инициативата продължава да приема пластмасови бутилки от вода, желателно без етикети и смачкани, в своята работилница на ул. Добруджа 22. Този подход позволява на жителите на града да продължат да участват активно в рециклирането, докато се осигури по-гладък и ефективен процес за всички. Вавакада РЕ изразяват своята благодарност към общността за непрекъснатия ангажимент към рециклирането и подчертават своето решение да направят процеса още по-добър. С тези усилия, инициативата продължава да оказва своето значимо въздействие върху опазването на околната среда и да подпомага развитието на устойчиви практики в общността.",
                "_ownerId": "1",
                "category": "11",
                "region": "2",
                "_createdOn": 1701240528000,
                "_updatedOn": 1701244961000
            },
            "12499": {
                "title": "Нови снеговалежи и спад на температурите очаквани в България, Румъния и Молдова",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/f36aab830b9f0ee9dedb3ca1011e7ae6.webp",
                "article": "След значителните валежи и бури, България, Румъния и Молдова се подготвят за нова вълна на зимно време. По-рано тази седмица, Европейският център за средносрочни прогнози на времето (ECMWF) включи в своите прогнози предстоящ циклон, идващ от Северна Африка. Този циклон се очаква да донесе значителни снеговалежи между 7-и и 9-и декември. Въпреки че прогнозата може да бъде разглеждана като предположение, ако този циклон се материализира, се предвижда обилен снеговалеж в тези райони. Освен това, спад на температурите се очаква след 10-и декември, като в някои низинни и котловинни райони температурите могат да достигнат до минус 15 градуса по Целзий. Това предупреждение е важно за обществото и местните власти, за да вземат предвидателни мерки и да се подготвят за зимни условия и евентуални трудности.",
                "_ownerId": "1",
                "category": "21",
                "region": "4",
                "_createdOn": 1701240686000,
                "_updatedOn": 1701240686000
            },
            "12500": {
                "title": "Енергото дължи компенсации на всеки гражданин без ток",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/cd20ab4cf7952b0c0d222cb9afffb5e3.webp",
                "article": "Електроразпределителните дружества (ЕРП) в България са задължени да обезщетят гражданите, останали без ток през последните денонощия, заяви омбудсманът Диана Ковачева в интервю за bTV. Тя обясни правата на пострадалите от снежната буря, като подчерта, че мнозина вече прекарват четвърто денонощие в студ и тъмнина. Според Ковачева, хората имат право на обезщетение от 30 лева за прекъсвания до 24 часа и допълнително по 20 лева за всеки час след първите 36 часа без ток. Омбудсманът подчерта, че е длъжност на ЕРП-тата да поддържат електропреносната мрежа и да окастрят клоните в сервитутните зони за предпазване на кабелите. Ковачева осветли въпроса за длъжността на КЕВР да следи дали ЕРП-тата изпълняват инвестиционните си планове. Тя настоя дружествата да обезщетяват гражданите автоматично, без да чакат съдебни дела за претърпени вреди. Омбудсманът определи предвидените обезщетения като символични и изрази възмущението си от факта, че в неделя телефоните 112 и на електроразпределителните дружества бяха недостъпни, лишавайки гражданите от информация. Ситуацията в малките населени места остава хаотична, с липса на ток и вода, заледени пътища и безпомощност на местните власти. Телефоните на \"Енерго Про\" са били недостъпни от събота, а сигналите по електронната поща не достигат до аварийните екипи. В Бяла Черква, например, хората остават на тъмно и студено, а властите не могат да уточнят кога токът ще бъде възстановен. Омбудсманът отбеляза, че най-много жалби се получават за качеството на тока и повреди на електроуредите, причинени от него. Тя призова за по-добра координация и информация, подчертавайки необходимостта от справяне с проблемите по по-ефективен и организиран начин.",
                "_ownerId": "1",
                "category": "6",
                "region": "1",
                "_createdOn": 1701241006000,
                "_updatedOn": 1701241035000
            },
            "12501": {
                "title": "ВИДЕО: Краси Радков в ролята на Явор от Калипетрово във вечерното шоу на Слави Трифонов",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/7791cc145de590a2d35c17edf620e861.webp",
                "article": "Вчера, известният актьор Краси Радков в ролята на Явор от Калипетрово разигра скеч във вечерното шоу на Слави Трифонов по телевизия 7\/8. Припомняме, че Явор нахлу в администрацията на ЕНЕРГО ПРО в Силистра в понеделник сутринта с хляб, дъска за рязане, парти грил и мръвка. Безпрецедентния му протест беше гледан от над 3 млн. души във фейсбук. Вижте скеча на Краси Радков тук: ",
                "_ownerId": "1",
                "category": "23",
                "region": "7",
                "_createdOn": 1701248902000,
                "_updatedOn": 1701248902000
            },
            "12502": {
                "title": "Цяло врачанско село без ток ще приготвя сандвичи по \"рецепта\" на Явор от Калипетрово в местното Енерго",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/3588c506af0e03c0ca93ab568b39b2f6.webp",
                "article": "Жителите на врачанското село Върбешница, които останаха без ток и вода за четири денонощия, са готови да предприемат драстични мерки в отговор на своето неблагоприятно положение. Вдъхновени от примера на Явор от Калипетрово, който се справи с липсата на ток, като си направи сандвичи в офиса на енергото в Силистра, жителите на Върбешница планират подобни действия. Кметът на селото Магдалена Динкова е в готовност да събере група от 50 души, за да отидат до енергийното дружество във Враца, където да си приготвят храна и да изперат дрехите си. Тя подчерта, че жителите на селата не трябва да бъдат третирани като граждани от втора категория. В селото има малки деца и трудноподвижни хора, които са особено засегнати от липсата на основни удобства. Динкова обясни, че селото се опитва да се справи с трудностите чрез използването на агрегати. Тя добави, че водата в магазините вече е свършила и че е насочила възрастните хора към Враца и Мездра, където имат близки, за да намерят убежище и помощ",
                "_ownerId": "1",
                "category": "19",
                "region": "6",
                "_createdOn": 1701272709000,
                "_updatedOn": 1701272771000
            },
            "12503": {
                "title": "Мария Габриел отстоява интересите на България и Украйна на среща на НАТО в Брюксел",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/57c4bbfae87047a05eff6861ec18cb8f.webp",
                "article": "Вицепремиерът и министър на външните работи Мария Габриел участва в срещата на министрите на външните работи на НАТО в Брюксел, проведена на 28 и 29 ноември. Срещата беше разделена на три сесии, където бяха обсъдени ключови въпроси за Алианса, включително приоритетите за предстоящата среща на върха на НАТО във Вашингтон през 2024 г. и отбелязването на 75-ата годишнина от създаването на НАТО. Мария Габриел подчерта значението на сигурността и стабилността в Черноморския регион и Западните Балкани, както и усилията на България за укрепване на Източния фланг на НАТО. Тя акцентира върху важната роля на България в областта на енергийната сигурност, иновациите, киберсигурността и борбата с дезинформацията. В рамките на третата сесия се състоя първата среща на Съвета НАТО-Украйна, на която бяха обсъдени начините за подкрепа на Украйна в краткосрочен и дългосрочен план. Министър Габриел изрази ангажимент на България за подкрепа на Украйна в различни сектори и наблегна на важността на солидарността с Украйна. На заседанието бяха одобрени подструктурите на Съвета НАТО-Украйна и работната програма за 2024 г. Приета беше съвместна декларация, подчертаваща напредъка в отношенията между НАТО и Украйна от последната среща на върха във Вилнюс.",
                "_ownerId": "1",
                "category": "16",
                "region": "2",
                "_createdOn": 1701274599000,
                "_updatedOn": 1701274599000
            },
            "12504": {
                "title": "Слънчево време надвисва над Силистренско с очаквано повишение на температурите",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/ad9869c4743ea5c467003b9d8b7980ed.webp",
                "article": "Жителите на Силистренско могат да очакват променлива облачност и слаби валежи от дъжд през нощта. В часовете след полунощ облачността ще намалее, като вятърът ще отслабне до сутринта. Минималните температури ще бъдат между минус 2° и плюс 3°. Утре преди обяд ще бъде предимно слънчево, а следобед ще има временни увеличения на облачността, без валежи. Вятърът ще се преориентира от юг, като през деня ще бъде слаб до умерен. Максималните температури в региона ще достигнат от 7° до 12°, като за град Силистра се очаква минимална температура от -2° и максимална от 10°​​. С прогнозите за подобряване на времето, жителите на региона могат да се насладят на приятни и слънчеви моменти, което ще предостави възможност за различни дейности на открито.",
                "_ownerId": "1",
                "category": "8",
                "region": "8",
                "_createdOn": 1701326381000,
                "_updatedOn": 1701326381000
            },
            "12505": {
                "title": "Васил Петров с Коледен концерт в Силистра",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/cdb740e5b64d458622e0923374a341b9.webp",
                "article": "Васил Петров, обичаният български джаз изпълнител, ще проведе концерт със специално Коледно турне, наречено \"White Christmas\" (Бяла Коледа) в град Силистра на 19-ти декември. Това е част от серия от вълнуващи концерти в различни градове на България. В програмата на турнето са включени класически Коледни хитове, изпълнени с изискан джаз, възхитителни валсове и празнични химни. Зрителите ще имат възможността да се насладят на несравним симфоничен звук, съчетан с емоционално зареден джаз, благодарение на участието на Врачанска Филхармония под диригентството на Христо Павлов. Сред изпълнителите са също Йордан Тоновски (пиано), Христо Минчев (бас), Кристиан Желев (ударни), изумителната цигуларка Зорница Иларионова и сопраното Таня Лазарова​​. Предстоящият концерт е част от празничния сезон, който ще предложи на публиката едно незабравимо музикално изживяване. Васил Петров е известен със своя талант да създава атмосфера на топлина и уют, която е идеална за предаване на чувството за радост и светла вяра, характерни за Рождество Христово. Целта на турнето е да пресъздаде тази атмосфера и да донесе празнично настроение на аудиторията. Сред песните, които ще бъдат изпълнени, са \"White Christmas\", \"Ave Maria\", \"Let it Snow\", \"Jingle Bells\", \"The Christmas Waltz\", както и авторската песен на Васил Петров \"На Коледа\"​​.",
                "_ownerId": "1",
                "category": "20",
                "region": "7",
                "_createdOn": 1701326493000,
                "_updatedOn": 1701329527000
            },
            "12506": {
                "title": "Община Дулово стартира конкурс за най-забележителна коледна украса с атрактивни награди",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/c60f6dfc38bbf7c197b611d590f556d0.webp",
                "article": "Община Дулово обяви организацията на конкурс за най-красива външна коледна украса, който е част от подготовката за предстоящите коледни и новогодишни празници. Участие в конкурса могат да вземат училища, детски градини, читалища, фирми, търговски обекти, както и отделни граждани, желаещи да допринесат за празничното настроение в града. Желаещите да участват трябва да изпратят снимки на своята коледна украса като лично съобщение на страницата на община Дулово във Фейсбук. Експертна комисия ще оцени участвалите жилищни и обществени сгради, за да определи победителите. За конкурса е предвиден награден фонд от 1000 лева. Победителят ще получи 500 лева, вторият класирал се ще получи 300 лева, а третият - 200 лева. Наградите ще бъдат връчени от кмета на общината инж. Невхис Мустафа на 31 декември по време на новогодишното тържество в центъра на Дулово​​.",
                "_ownerId": "1",
                "category": "4",
                "region": "2",
                "_createdOn": 1701326715000,
                "_updatedOn": 1701327821000
            },
            "12507": {
                "title": "Силистренско сдружение стартира кампания за борба с насилието над жени",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/33358b1c342d9fcdce92fd0d3ec7f97b.webp",
                "article": "Женското сдружение \"Екатерина Каравелова\" в Силистра обяви старта на 16-дневната кампания за борба с насилието над жени и домашното насилие. Кампанията се провежда от 25 ноември до 10 декември и включва редица инициативи, насочени към повишаване на осведомеността за проблема и подкрепа на жертвите на насилие. Програмата на кампанията включва следните ключови събития: Среща с учители и педагогически съветници на 5 декември 2023 г. в офиса на сдружението. Целта на срещата е да запознае учителите с проблема на насилието над жени и домашното насилие и да обсъди начините за превенция на насилието в училищата. Ден на отворените врати на 8 декември 2023 г. в офиса на сдружението, където всеки може да посети офиса и да се запознае с работата му в подкрепа на жертвите на насилие. Кинопрожекция на филма \"Игра на доверие\" на 7 декември 2023 г. в кинозала \"Латона\", която разказва историята на млада жена, станала жертва на домашно насилие. Мария Петрова, председател на ЖС \"Екатерина Каравелова\", заяви, че насилието над жени и домашното насилие е сериозен проблем, който засяга милиони жени по света. Тя подчерта значението на кампанията като важна стъпка за повишаване на осведомеността за проблема и насърчаване на действия за неговото преодоляване. 16-дневната международна кампания се провежда всяка година от 1991 г. с цел да повиши осведомеността за проблема с насилието над жени и домашното насилие, да подпомогне жертвите на насилие и да насърчи действия за преодоляване на проблема. В България кампанията се организира от различни организации, включително неправителствени организации, държавни институции и частни компании​​.",
                "_ownerId": "1",
                "category": "10",
                "region": "6",
                "_createdOn": 1701326862000,
                "_updatedOn": 1701326862000
            },
            "12508": {
                "title": "Община Силистра разглежда ново предложение за изграждане на амбициозен вятърен парк",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/9a3db73e3926e8810da8ed8741a251c4.webp",
                "article": "На последното заседание на Общински съвет Силистра за мандата 2019-2023 г. беше отхвърлено предложението за изграждане на вятърен парк в землището на общината. Въпреки това, предстои втори опит за реализацията на тази значителна инвестиция, оценявана на около 400 милиона евро, на утрешното второ редовно заседание за мандат 2023-2027. Фирмата \"Еура Енерджи\" АД е подала заявка за изменение на Общия устройствен план (ОУП) за проекта \"Вятърен парк за производство на електрическа енергия 'ВЕП Силистра'\". Този проект предвижда изграждането на 43 ветрогенератора, които ще имат мощност над 300 мегавата. В перспектива, възобновяемата енергия, генерирана от тези съоръжения, би могла да направи Силистра енергиен хъб за Североизточна България. При успешно стартиране на проекта, инвеститорът обещава създаването на стотици работни места по време на строителството и поне 40 работни места за обслужващ персонал на парка по време на неговата експлоатация​​.",
                "_ownerId": "1",
                "category": "4",
                "region": "7",
                "_createdOn": 1701326983000,
                "_updatedOn": 1701326983000
            },
            "12509": {
                "title": "Млади таланти от Силистра с участие в националното състезание по творческо писане на английски език",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/0b70cc60d0cd09076f4ef76be331fc41.webp",
                "article": "Учениците от ПГСУАУ \"Атанас Буров\" в Силистра се включиха в 14-тото национално състезание по творческо писане на английски език \"Creative Writing\", проведено на 22 ноември. Състезанието е предназначено за ученици от 9 до 11 клас и има за цел да насърчи младите таланти да развиват своите креативни способности чрез писане на английски език. През един час, 12 ученика се справиха с предизвикателството да напишат текст на английски по зададени теми без помощта на речници, учебници или други ресурси. Темите на състезанието включваха заглавия като \"A Ship in Harbor is Safe, but That’s not What Ships are Built for\", \"It’s Kind of Fun to Do the Impossible\", и \"The Dream Catcher’s Diary\". Участниците се надяват да се класират за националния кръг на състезанието​​.",
                "_ownerId": "1",
                "category": "20",
                "region": "3",
                "_createdOn": 1701327262000,
                "_updatedOn": 1701327262000
            },
            "12510": {
                "title": "Тутракан пред трети опит за избор на председател на Общинския съвет след предишни неуспешни опити",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/5e11eac4f1d430fa850a2457061003e0.webp",
                "article": "За трети пореден път ще се опита да избере председател на Общинския съвет в Тутракан. Предстоящото заседание ще се проведе днес от 10:00 часа, като това е поредното усилие след неуспешните опити на 8 и 17 ноември. По време на първата сесия на новоизбрания съвет, свикана от областния управител, не беше постигнат резултат в двата тура за избор на председател. На първия тур бяха предложени Димо Денчев от ПП ГЕРБ, Нехат Кантаров от ДПС, Данаил Николов от \"БСП за България\" и Кристиян Калчев от МК \"Свобода\", като никой от тях не успя да събере повече от половината гласове на съветниците. Общинският съвет в Тутракан е съставен от представители на пет партии и коалиции, като ДПС има най-много съветници – петима, следвани от ГЕРБ с четирима, ПП \"Социалдемократическа партия\" и местна коалиция \"Свобода\" - с по трима, и \"БСП за България\" - с двама. При липса на избор на председател на Общински съвет в рамките на три месеца, ще бъде наложено провеждането на нови избори за общински съвет в Тутракан​​.",
                "_ownerId": "1",
                "category": "4",
                "region": "6",
                "_createdOn": 1701327376000,
                "_updatedOn": 1701329940000
            },
            "12511": {
                "title": "Обширен скрининг в Силистра за предпазване на децата от гръбначни изкривявания",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/13beb458e1a07959ea5d946f3f14d144.webp",
                "article": " В Силистра се организира значителен скрининг за гръбначни изкривявания сред учениците, като част от усилията за подобряване на детското здраве. Почти 600 деца от 5-и до 7-и клас от пет различни училища в региона ще преминат през този процес на проверка. Този скрининг е резултат от инициатива на \"Ротари клуб\" в Силистра, която е продължение на техните усилия от миналата година, когато бяха проверени 900 деца за нарушения в зрението. Според Николай Костов, член на организацията, целта е родителите да бъдат информирани за евентуални проблеми при децата им и да потърсят специализирана медицинска помощ. Кинезитерапевтът Веселин Костов посочва, че фокусът е по-скоро върху нарушената динамика на тялото, свързана с тежестта на ученическите раници и промени в стойката на децата, отколкото само на гръбначните изкривявания. Той също така акцентира върху значението на носенето на ученическите раници на двете рамене и поддържането на изправена глава, както и на необходимостта от физическа активност извън часовете по физическо възпитание. За следващата учебна година \"Ротари клуб\" планира инициативи за подобряване на емоционалното и психическото здраве на децата в сътрудничество с Министерство на образованието и науката​​.",
                "_ownerId": "1",
                "category": "1",
                "region": "1",
                "_createdOn": 1701327590000,
                "_updatedOn": 1701327590000
            },
            "12512": {
                "title": "Повишен контрол и точност при техническите прегледи от следващата година",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/a3754475dc36a3b22dc0fba6425b16e8.webp",
                "article": "От следващата година влизат в сила нови изисквания за техническите прегледи на автомобили, които целят значително повишаване на контрола и точността на измерванията. Министърът на транспорта Георги Гвоздейков обяви, че техническите пунктове ще трябва да осигурят свързаност на уредите за измерване с информационната система на ИА \"Автомобилна администрация\". Така данните от измерванията ще се пращат автоматично по електронен път, което ще ограничи възможностите за промяна на данните. Сред нововъведенията е и задължението на производителите да предоставят на ИА \"Автомобилна администрация\" техническата информация за пътните превозни средства. Досега липсата на такава информация в пунктовете затрудняваше извършването на прегледите. Освен това, при определянето на екологичните групи са направени промени – вече ще се отчитат реалните данни от измерването на емисиите в отработилите газове за всички автомобили, а не само в зависимост от датата на първата регистрация. Министър Гвоздейков подчерта и значението на проверката на системата за спешни повиквания eCall по време на техническите прегледи. Тази система е задължителна за някои видове превозни средства съгласно европейското законодателство. Също така, той припомни за промените в Закона за обществените поръчки, целящи насърчаване на чисти и енергийно ефективни пътни превозни средства. Накрая, Гвоздейков сподели идеята за създаването на единен регистър за пътните превозни средства, който ще съдържа пълна информация за техническото състояние, изменения на конструкцията, изминати километри, ремонти и техническо обслужване на автомобилите. Този регистър ще даде възможност на потребителите да направят информиран избор при покупката на автомобил​​.",
                "_ownerId": "1",
                "category": "8",
                "region": "4",
                "_createdOn": 1701328031000,
                "_updatedOn": 1701328031000
            },
            "12513": {
                "title": "Променливи температури и повече валежи очакват България през декември според НИМХ",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/817e458025eb789163485863c8cba777.webp",
                "article": " В последните дни на ноември Националният институт по метеорология и хидрология (НИМХ) представи своята месечна прогноза за декември, която сочи значителни колебания в температурите и увеличение на валежите в България. Анастасия Кирилова, синоптик в НИМХ, информира за очакваните метеорологични условия, представяйки прогнозата на отдела \"Метеорологични прогнози\" в института. Прогнозата на НИМХ предвижда, че най-ниските температури през декември ще бъдат между минус 10 и минус 5 градуса, докато най-високите ще достигнат между 13 и 18 градуса. Средната месечна температура се очаква да бъде около нормата за страната, като в различните региони тя ще варира - от 0 до 2 градуса в Северна България и по високите полета, 2-3 градуса в Горнотракийската низина, 4-6 градуса по Черноморието и в най-южните райони, и от минус 8 до минус 2 градуса в планините. Освен това, месечната сума на валежите се очаква да бъде около и над нормата, варираща между 40 и 60 литра на квадратен метър в по-голямата част от страната, до 70 литра на квадратен метър в планините и между 70 и 110 литра на квадратен метър в най-южните райони. В началото на месеца се предвижда сравнително топло време с разкъсана облачност. През периода 2-4 декември, с преминаването на средиземноморски циклон, облачността ще се вплътни и на много места в страната ще има валежи от дъжд, които в северозападната част ще преминават в сняг. Към средата на първото десетдневие се очаква намаляване на вероятността за валежи, но се повишава възможността за мъгливо време в низините. През второто десетдневие се очаква повишение на температурите, но също така ще има периоди с обилни валежи и понижение на температурите. През третото десетдневие на декември се прогнозират валежи от дъжд, а в Северна България и по високите полета - и от сняг. Температурите ще се повишават към края на месеца, но ще бъдат съпроводени с увеличение на валежите. Декември, като първи месец от метеорологичната зима, традиционно е характеризиран с облачно и мъгливо време, като студените нахлувания от север често довеждат до снежни валежи. В сравнение с другите месеци, валежите през декември са сравнително малко, особено в Дунавската равнина. Астрономическата зима започва на 22 декември в 5:27 часа. Тази подробна прогноза от НИМХ предоставя на гражданите важна информация за планиране на своите дейности през последния месец на годината, особено в контекста на предстоящите зимни празници и евентуалното пътуване и планиране на отдих.",
                "_ownerId": "1",
                "category": "19",
                "region": "1",
                "_createdOn": 1701328710000,
                "_updatedOn": 1701328710000
            },
            "12514": {
                "title": "45-годишен мъж от село в община Главиница бе задържан за отглеждане на растения от рода на конопа",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/6d6e676785359b3d3383dde9a08a3dbe.webp",
                "article": " Той е привлечен към наказателна отговорност от Районна прокуратура – Силистра за престъпление по чл. 354в, ал. 1 от НК и задържан за срок до 72 часа. Процесуалните действия, включително претърсване и изземване, бяха извършени от ОД МВР – Силистра. По време на операцията в дома на мъжа бе открита оранжерия в банята, пригодена за отглеждане на коноп. В помещението имало 11 растения в различни стадии на растеж и суха тревиста маса, чийто точен вид и количество остава да бъде установен след извършване на анализ. Работата по случая продължава под ръководството и надзора на прокурор от Районна прокуратура – Силистра, като предстои внасяне на искане за налагане на най-тежката мярка за неотклонение – „задържане под стража“, спрямо обвиняемия.",
                "_ownerId": "1",
                "category": "10",
                "region": "3",
                "_createdOn": 1701328930000,
                "_updatedOn": 1701342454000
            },
            "12516": {
                "title": "Ритуал „прерязване на лента“ в Природонаучен музей „Сребърна“",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/fbdf9935a50f515464415a36d6fca0e1.webp",
                "article": "В Природонаучен музей „Сребърна“ в резерват „Сребърна“ бе проведено събитие във връзка с края на дейността „Изграждане на Западен канал“ по проект „Управление на сукцесионните процеси и подобряване на качеството на местообитанията на защитени водолюбиви видове във влажната зона в ПР „Сребърна“, изпълняван от Регионална инспекция по околната среда и водите – Русе. Инж. Цонка Христова – директор на Инспекцията, представи пред присъстващите, сред които областният управител Минчо Йорданов, кметът на община Силистра Александър Сабанов и председателят на ОбС-Силистра Димитър Трендафилов, резултатите от дейността, започнала преди две години с „първа копка“ в местността „Суха чешма“. Заедно с тях и с представител от фирмата изпълнител „Строител Дая“ бе „прерязана лента“ в традиционен български ритуал, с който се пожелава успех на всяка нова придобивка. Стана ясно, че цялостно проектът ще бъде отчетен през м. януари 2024 г. Инж. Христова благодари за съдействието на община Силистра, както и на кметовете на селата Сребърна, Айдемир и Ветрен, който също са били съпричастни към отделните моменти при осъществяване на дейностите в различните етапи. На аудиторията бе припомнено, че идеята на проекта да се осигури още една възможност зя пряка връзка с река Дунав, освен т.нар. източен канал, като чрез шлюзове ще се разчита водата да размие и отнесе събралата се през годините тиня в езерото. По този начин се разчита естествената циркулация да подобри условията в местообитанието за 220 вида птици, от които 90 вида водоплаващи, а сред тях и къдроглавият пеликан.",
                "_ownerId": "1",
                "category": "4",
                "region": "3",
                "_createdOn": 1701329130000,
                "_updatedOn": 1701329130000
            },
            "12517": {
                "title": "До края на декември заявяваме данъчните облекчения за деца чрез работодателя",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/14b8ade1199f466d26e6a509a4e1d880.webp",
                "article": "Родителите, които искат да ползват данъчните облекчения за деца или за деца с увреждания през работодателя си, е необходимо да заявят желанието си пред него, като подадат съответната декларация от 30 ноември до 31 декември 2023 г. В този случай работодателят може да възстанови данъка в срок до края на януари 2024 г. Размерите на данъчните облекчения за придобитите доходи през 2023 г. се запазват същите като през предходната година. Сумите, които може да възстанови НАП, са в зависимост от броя на децата. За едно ненавършило пълнолетие дете облекчението от годишната данъчна основа е 6 000 лв., а сумата за получаване до 600 лв., за две – 12 000 лв. и сума за получаване до 1200 лв., за три и повече – 18 000 лв. със сума за получаване до 1800 лева. За отглеждане на едно дете с увреждания облекчението от годишната данъчна основа е в размер на 12 000 лв., като сумата за получаване е до 1 200 лева. Това са средствата, които могат да бъдат получени, когато лицата не са ползвали облекченията при авансовото облагане на доходите. За да ползва данъчните облекчения, физическото лице (включително едноличен търговец) трябва през 2023 г. да е получавало доходи, облагаеми с годишни данъци (данък върху общата годишна данъчна основа или данък върху годишната данъчна основа за доходите от стопанска дейност като едноличен търговец). Хората без доходи, или само с необлагаеми такива, като обезщетение за майчинство например, както и само с доходи, облагаеми с окончателен и\/или патентен данък, не могат да се възползват от облекченията, но това може да направи другият родител, ако отговаря на условията, допълват от НАП. Условията за ползване на данъчните облекчения за деца и деца с увреждания са подробно описани в сайта на НАП. Едно от най-важните изисквания за прилагане на облекченията е родителите да нямат публични задължения, подлежащи на принудително изпълнение. От НАП съветват гражданите да проверят онлайн с персонален идентификационен код данъчната си сметка за задължения преди да ползват данъчно облекчение, за да избегнат неудобства. Освен през работодател, другият начин за ползване на годишния размер на данъчните облекчения е с подаване на годишна данъчна декларация в НАП в срок от 10 януари до 30 април 2024 г. В този случай паричните суми ще бъдат възстановени след проверка от приходната агенция в срок от 1 месец след подаването на декларацията.",
                "_ownerId": "1",
                "category": "19",
                "region": "2",
                "_createdOn": 1701329187000,
                "_updatedOn": 1701329187000
            },
            "12518": {
                "title": "80% от страната ще има 5G свързаност до края на 2025 г.",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/90b3a81402bcb7ded5bfb8c337ca8c2e.webp",
                "article": "До края на 2025 г. 80 % от населението на страната ще има достъп до 5G свързаност като резултат от общите усилия на Министерството на транспорта и съобщенията, Комисията за регулиране на съобщенията и мобилните оператори. Това заяви заместник-министърът на транспорта и съобщенията Григори Григоров на откриването на информационен ден за възможностите за кандидатстване на български организации в конкурс за 5G проекти по Механизма за свързване на Европа. Конкурсът е продължение на инициативата на Европейската комисия за изграждане на точки за публичен достъп до високоскоростен, безжичен интернет на обществени места WiFi4EU. Тогава 91% от българските общини, които кандидатстваха, получиха финансиране и страната ни зае първо място по брой на предоставени ваучери. В тази връзка заместник-министър Григоров призова учебните и здравни заведения, общинските и публичните организации да участват активно в новия конкурс за 5G проекти, за да бъдат използвани успешно възможностите за финансиране. Общият бюджет е 51 млн. евро за всички държави от ЕС. Заместник-министърът припомни, че се работи усилено и за изпълнение на инвестиция от Плана за възстановяване и устойчивост, като целта е близо 400 000 българи в отдалечени райони да имат достъп до високоскоростен интернет и да ползват 5G мобилна мрежа. Паралелно с това всички 265 общини ще бъдат свързани с високоскоростни връзки в единна мрежа на държавната администрация. Свързаността от пето поколение ще получи още по-добро развитие след като през тази седмица мобилните оператори вече получиха лицензи да ползват честоти в обхватите 700 и 800 мегахерца, добави Григори Григоров. Новият конкурс по Механизма за свързана Европа е с подобрени условия за кандидатстване, като участниците имат по-дълъг срок за подготовка на предложенията си. Това каза по време на информационния ден Ставрос Калапотас от Генерална дирекция „Съобщителни мрежи, съдържание и технологии“ в Европейската комисия. Той съобщи, че европейските средства ще покрият до 75 % от направените инвестиции. Срокът за кандидатстване е 20 февруари 2024 г.",
                "_ownerId": "1",
                "category": "4",
                "region": "5",
                "_createdOn": 1701329312000,
                "_updatedOn": 1701329312000
            },
            "12519": {
                "title": "Днес празнуваме Андреевден",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/7f41bcbf46d41cdf800a4c24572991aa.webp",
                "article": "На 30 ноември, Православната църква чества паметта на Св. Апостол Андрей Първозвани. Той е известен като първият апостол, който последва Христос. Андрей, от ранни години търсещ божествената истина, станал ученик на Йоан Кръстител и по-късно се присъединил към Христос заедно с брат си Симон (Петър). Те били рибари от Витсаида и продължили да следват Христос, ставайки свидетели на Неговите чудеса, смърт и възкресениe. В българския фолклор, Андреевден е известен като празник на зърното и се свързва с убеждението, че светлината в денонощието започва да расте. Счита се, че в този ден денят започва да се увеличава, внасяйки свежест и ведрина в душите на хората. Традицията повелява сутринта рано да се взима от наедрялото зърно и да се хвърли в камината, символизирайки растежа на житните растения. Освен това, Андреевден е познат и като Мечкинден, свързан с легендата за свети Андрей, който възседнал мечка и посетил Бога, за да получи свой празник. В някои региони на България, хората варят царевица и я прехвърлят през комина, за да пазят от мечки стоката и човеците. На този ден, младите булки са на особена почит и изпълняват ритуал с хвърлянето на варените семена. На трапезата трябва да присъстват жито, боб, леща, грах, просо или ечемик Имен ден празнуват всички с имена производни на Андрей, като Андриян, Андрея, Андро, Храбър, Храбрин, Силен, Дешка, Първан и др.",
                "_ownerId": "1",
                "category": "3",
                "region": "5",
                "_createdOn": 1701346105000,
                "_updatedOn": 1701346105000
            },
            "12520": {
                "title": "Reporter Първа общинска конференция в Силистра разкрива иновациите в предучилищното образование",
                "img": "https:\/\/www.portal-silistra.eu\/images\/articles\/b05e415cb2ffbd2e0584d240686c476c.webp",
                "article": "Община Силистра, в сътрудничество с местните детски градини и с домакинството на ДГ \"Нарцис\", организира Първата общинска конференция на тема \"Иновации в предучилищното образование\". Събитието се провежда на 30 ноември и 1 декември 2023 г. в конферентната зала на ПГМТ \"Владимир Комаров\". Конференцията събира над 70 специалисти в областта на педагогиката от община Варна и Силистра, включително директори и учители от детски градини, както и представители на Регионалния център за подкрепа на приобщаващото образование. През първия ден са представени 27 добри практики от двете общини чрез доклади и презентации в различни секции като \"Изкуства\", \"Екология\", \"Познавателна и изследователска дейност\", \"Дигитални технологии\" и др. Участниците ще имат възможност да наблюдават открити практики в детските градини на община Силистра и да обсъждат актуални въпроси и проблеми в сферата на предучилищното образование. Доц. Емил Бузов, преподавател във ВТУ \"Св. св. Кирил и Методий\" и зам.-директор на Педагогически колеж – Плевен, ще изнесе встъпителна лекция на темата. Събитието цели да популяризира добрите практики и иновативните методи в областта и да стане традиционно с разширяване на обхвата на участниците.",
                "_ownerId": "2",
                "category": "3",
                "region": "5",
                "_createdOn": 1701350374000,
                "_updatedOn": 1701350374000
            },
        },
        categories: {
            "1": {
                "category": "Анализи",
                "slug": "analizi"
            },
            "3": {
                "category": "Крими",
                "slug": "krimi"
            },
            "4": {
                "category": "Култура",
                "slug": "kultura"
            },
            "5": {
                "category": "Общество",
                "slug": "obshtestvo"
            },
            "6": {
                "category": "Политика",
                "slug": "politika"
            },
            "8": {
                "category": "Спорт",
                "slug": "sport"
            },
            "10": {
                "category": "Здраве",
                "slug": "zdrave"
            },
            "11": {
                "category": "Личен коментар",
                "slug": "lichen-komentar"
            },
            "16": {
                "category": "Технологии",
                "slug": "tehnologii"
            },
            "17": {
                "category": "Бизнес",
                "slug": "biznes"
            },
            "18": {
                "category": "Земеделие",
                "slug": "zemedelie"
            },
            "19": {
                "category": "Интервюта",
                "slug": "intervyuta"
            },
            "20": {
                "category": "История",
                "slug": "istoriq"
            },
            "21": {
                "category": "Общински съвет",
                "slug": "obshtinski-suvet"
            },
            "22": {
                "category": "Поздрави",
                "slug": "pozdravi"
            },
            "23": {
                "category": "Образование",
                "slug": "obrazovanie"
            }
        },
        regions: {
            "1": {
                "region": "Силистра",
                "slug": "silistra"
            },
            "2": {
                "region": "Тутракан",
                "slug": "tutrakan"
            },
            "3": {
                "region": "Дулово",
                "slug": "dulovo"
            },
            "4": {
                "region": "Главиница",
                "slug": "glavinica"
            },
            "5": {
                "region": "Ситово",
                "slug": "sitovo"
            },
            "6": {
                "region": "Кайнарджа",
                "slug": "kaynardzha"
            },
            "7": {
                "region": "Алфатар",
                "slug": "alfatar"
            },
            "8": {
                "region": "България",
                "slug": "bulgaria"
            }
        },
    };
    var rules$1 = {
        users: {
            ".create": false,
            ".read": [
                "Owner"
            ],
            ".update": false,
            ".delete": false
        },
        members: {
            ".update": "isOwner(user, get('teams', data.teamId))",
            ".delete": "isOwner(user, get('teams', data.teamId)) || isOwner(user, data)",
            "*": {
                teamId: {
                    ".update": "newData.teamId = data.teamId"
                },
                status: {
                    ".create": "newData.status = 'pending'"
                }
            }
        }
    };
    var settings = {
        identity: identity,
        protectedData: protectedData,
        seedData: seedData,
        rules: rules$1
    };

    const plugins = [
        storage(settings),
        auth(settings),
        util$2(),
        rules(settings)
    ];

    const server = http__default['default'].createServer(requestHandler(plugins, services));

    const port = 3030;
    server.listen(port);
    console.log(`Server started on port ${port}. You can make requests to http://localhost:${port}/`);
    console.log(`Admin panel located at http://localhost:${port}/admin`);

    var softuniPracticeServerMaster = {

    };

    return softuniPracticeServerMaster;

})));
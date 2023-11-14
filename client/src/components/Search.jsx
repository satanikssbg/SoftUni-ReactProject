const Search = () => {
    return (
        <div id="searchBox" className="collapse container">
            <div className="row">
                <form>
                    <div>
                        <label htmlFor="search_key">
                            <input
                                placeholder="Търси"
                                type="text"
                                name="search_key"
                                id="search_key"
                            />
                        </label>
                        <label className="lupa">
                            <i
                                style={{ color: "#0f4359", fontSize: 24 }}
                                className="fas fa-search"
                                aria-hidden="true"
                            />
                            <input type="submit" name="search_post" />
                        </label>
                        <br />
                    </div>
                </form>
                <p id="search_error" style={{ fontSize: 14, fontWeight: 700 }} />
            </div>
        </div>
    );
}

export default Search;
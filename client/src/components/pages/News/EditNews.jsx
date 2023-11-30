import { useParams } from "react-router-dom";

import * as request from '../../../lib/request';

const EditNews = () => {
    const { id } = useParams();


    const testEdit = () => {

        request.patch(`http://localhost:3030/data/news/${id}`, { title: 'proba1' }).then(res => console.log(res));


        console.log('e');
    }

    return (
        <>
            <button onClick={testEdit}>{id}</button>
        </>
    );
};

export default EditNews;
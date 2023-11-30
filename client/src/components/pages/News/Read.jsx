import { Link, useParams } from "react-router-dom";

const Read = () => {
    const { id } = useParams();
    return (
        <>
            {id}
            <hr />
            <Link to={`/news/edit/${id}`}>Edit</Link >
        </>
    );
};

export default Read;
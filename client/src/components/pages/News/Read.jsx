import { useContext, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AuthContext from "../../../contexts/authContext";
import * as newsService from '../../../services/newsService';
import Loading from "../../layouts/Loading";

const Read = () => {
    const { id } = useParams();
    const { isAuthenticated, userRole, userId } = useContext(AuthContext);

    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();

    const [article, setArticle] = useState({});

    useEffect(() => {
        setLoading(true);

        newsService.getOne(id)
            .then(data => {
                setArticle(data);
                setLoading(false);
            })
            .catch(error => navigate('/news'));
    }, [id]);

    if (loading) {
        return <Loading />
    }

    return (
        <>
            {article.title}
            <hr />

            {
                (isAuthenticated && ((userRole === "admin") || (userRole === "reporter" && article._ownerId === userId))) && (
                    <Link to={`/news/edit/${id}`} className="btn btn-primary">Edit</Link>
                )
            }
        </>
    );
};

export default Read;
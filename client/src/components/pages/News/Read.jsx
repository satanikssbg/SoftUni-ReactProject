import { useParams } from "react-router-dom";

const Read = () => {
    const { id } = useParams();
    return (
        <>
            {id}
        </>
    );
};

export default Read;
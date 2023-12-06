import { useEffect } from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import useForm from '../../../hooks/useForm';
import addCommentsValidate from "./addCommentsValidate";

const CommentFormKeys = {
    Comment: 'comment',
    Id: 'id',
};

const EditCommentModal = ({ show, onClose, comment: { comment, commentId }, editCommentHandler }) => {
    useEffect(() => {

        return () => {
            onClose();
        };
    }, [onClose]);

    const { values, errors, onChange, onSubmit } = useForm(editCommentHandler, {
        [CommentFormKeys.Comment]: comment,
        [CommentFormKeys.Id]: commentId,
    }, addCommentsValidate);

    return (
        <Modal
            show={show}
            onHide={onClose}
            keyboard={false}
            centered
        >
            <form onSubmit={onSubmit} noValidate>
                <Modal.Header>
                    <Modal.Title>Редактиране на коментар</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <textarea
                        id={CommentFormKeys.Comment}
                        name={CommentFormKeys.Comment}
                        value={values[CommentFormKeys.Comment]}
                        onChange={onChange}
                        placeholder="Въведете коментар"
                        rows={3}
                        type="text"
                        className={`form-control ${errors[CommentFormKeys.Comment] ? 'is-invalid' : ''}`}
                    />
                    {
                        errors[CommentFormKeys.Comment] && <div className="invalid-feedback">{errors[CommentFormKeys.Comment]}</div>
                    }
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="success" type="submit">Редактирай</Button>
                    <Button variant="secondary" onClick={onClose}>Отказ</Button>
                </Modal.Footer>
            </form>
        </Modal>
    );
}

export default EditCommentModal;
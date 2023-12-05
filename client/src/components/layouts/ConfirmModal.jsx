import { useEffect } from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';

const ConfirmModal = ({ show, onClose, description, confim }) => {
    useEffect(() => {

        return () => {
            onClose();
        };
    }, [onClose]);

    return (
        <Modal
            show={show}
            onHide={onClose}
            backdrop="static"
            keyboard={false}
            centered
        >
            <Modal.Header>
                <Modal.Title>Потвърждение</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {description}
            </Modal.Body>
            <Modal.Footer>
                <Button variant="danger" onClick={confim}>Потвърждавам</Button>
                <Button variant="secondary" onClick={onClose}>Отказ</Button>
            </Modal.Footer>
        </Modal>
    );
}

export default ConfirmModal;
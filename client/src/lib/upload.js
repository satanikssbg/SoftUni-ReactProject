import { FIREBASE_STORAGE, IMAGES_HEIGHT, IMAGES_WIDTH } from "../config";
import { ref, uploadString, getDownloadURL } from "firebase/storage";

const upload = async (file) => {
    let fileName = new Date().getTime();

    const storageRef = ref(FIREBASE_STORAGE, `/images/${fileName}.jpg`);

    const targetWidth = IMAGES_WIDTH;
    const targetHeight = IMAGES_HEIGHT;

    const dataURL = await new Promise((resolve) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');

            img.onload = () => {
                let newWidth, newHeight;
                const aspectRatio = img.width / img.height;

                /*
                if (img.width > img.height) {
                    newWidth = targetWidth;
                    newHeight = targetWidth / aspectRatio;
                } else {
                    newWidth = targetHeight * aspectRatio;
                    newHeight = targetHeight;
                }

                const xOffset = (newWidth - targetWidth) / 2;
                const yOffset = (newHeight - targetHeight) / 2;
                */

                newWidth = targetWidth;
                newHeight = targetWidth / aspectRatio;

                const xOffset = 0;
                const yOffset = (newHeight - targetHeight) / 2;

                canvas.width = targetWidth;
                canvas.height = targetHeight;

                context.drawImage(img, -xOffset, -yOffset, newWidth, newHeight);

                const newDataURL = canvas.toDataURL();
                resolve(newDataURL);
            };
        };

        reader.readAsDataURL(file);
    });

    try {
        const snapshot = await uploadString(storageRef, dataURL, 'data_url', { contentType: 'image/jpeg' });

        const url = await getDownloadURL(snapshot.ref);

        return url;
    } catch (error) {
        throw new Error(error);
    }
};

export default upload;
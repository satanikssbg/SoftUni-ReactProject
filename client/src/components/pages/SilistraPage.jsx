import { Routes, Route } from 'react-router-dom';

import InformationPage from './Silistra/InformationPage';
import HistoryPage from './Silistra/HistoryPage';
import HolidayPage from './Silistra/HolidayPage';
import ErrorPage from './ErrorPage';

import Sidebar from '../layouts/Sidebar';

const SilistraPage = () => {
    return (
        <Routes>
            <Route path="/" element={<InformationPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/holiday" element={<HolidayPage />} />
            <Route path="*" element={<ErrorPage />} />
        </Routes>
    );
}

export default SilistraPage;
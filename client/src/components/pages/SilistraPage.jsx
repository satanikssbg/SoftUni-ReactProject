import { Routes, Route } from 'react-router-dom';

import InformationPage from './Silistra/InformationPage';
import HistoryPage from './Silistra/HistoryPage';
import HolidayPage from './Silistra/HolidayPage';
import ErrorPage from './ErrorPage';

import Sidebar from '../layouts/Sidebar';

const SilistraPage = () => {
    return (
        <div className="row">
            <div className="contentWrap container col-12 col-sm-12 col-md-12 col-lg-9 col-xl-9">
                <Routes>
                    <Route path="/" element={<InformationPage />} />
                    <Route path="/history" element={<HistoryPage />} />
                    <Route path="/holiday" element={<HolidayPage />} />
                    <Route path="*" element={<ErrorPage />} />
                </Routes>
            </div>

            <Sidebar />
        </div>
    );
}

export default SilistraPage;
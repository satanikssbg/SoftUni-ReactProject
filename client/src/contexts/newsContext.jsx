import { createContext, useEffect, useState } from "react";

import * as newsService from '../services/newsService';

const NewsContext = createContext();

NewsContext.displayName = 'NewsContext';

export const NewsProvider = ({
    children
}) => {
    const [categories, setCategories] = useState({});
    const [regions, setRegions] = useState({});

    useEffect(() => {
        const fetchCategories = async () => {
            try {
                const resultCategories = await newsService.getCategories();

                const dataCategories = Object.values(resultCategories);

                const sortedCategories = dataCategories.sort((a, b) => a.category.localeCompare(b.category));

                setCategories(sortedCategories);
            } catch (error) {
                console.error("Error fetching categories:", error);
            }
        };

        const fetchRegions = async () => {
            try {
                const resultRegions = await newsService.getRegions();

                const regionsArray = Object.values(resultRegions);

                regionsArray.sort((a, b) => {
                    const regionA = a.region.toLowerCase();
                    const regionB = b.region.toLowerCase();

                    if (regionA === "българия") {
                        return 1;
                    } else if (regionB === "българия") {
                        return -1;
                    } else {
                        return regionA.localeCompare(regionB);
                    }
                });

                setRegions(regionsArray);
            } catch (error) {
                console.error("Error fetching regions:", error);
            }
        };

        fetchCategories();
        fetchRegions();
    }, []);

    const values = {
        categories,
        regions
    };

    return (
        <NewsContext.Provider value={values}>
            {children}
        </NewsContext.Provider>
    );
};

export default NewsContext;
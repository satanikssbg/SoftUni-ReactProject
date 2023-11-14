const baseUrl = 'http://localhost:3030/jsonstore';

export const getNewsCategories = async (signal) => {
    try {
        const response = await fetch(`${baseUrl}/newsCategories`, { signal });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const result = await response.json();
        const data = Object.values(result);

        const sortedData = data.sort((a, b) => a.category.localeCompare(b.category));

        return sortedData;
    } catch (error) {
        console.error('Error fetching news categories:', error);
        throw error;
    }
};

export const getRegions = async (signal) => {
    try {
        const response = await fetch(`${baseUrl}/regions`, { signal });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const result = await response.json();
        const data = Object.values(result);

        const regionsArray = Object.values(data);

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

        return regionsArray;
    } catch (error) {
        console.error('Error fetching news categories:', error);
        throw error;
    }
};
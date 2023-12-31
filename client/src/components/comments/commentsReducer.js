export const commentsReducer = (state, action) => {
    switch (action?.type) {
        case 'GET_ALL_COMMENTS':
            return [...action.payload];

        case 'ADD_COMMENT':
            return [...state, action.payload];

        case 'EDIT_COMMENT':
            return state.map(editComment => editComment._id === action.payload._id ? { ...editComment, comment: action.payload.comment } : editComment);

        case 'REMOVE_COMMENT':
            return state.filter(removeComment => removeComment._id !== action.payload._id);

        case 'CLEAR_COMMENTS':
            return [];

        default:
            return state;
    }
};

export const commentsLatestReducer = (state, action) => {
    switch (action?.type) {
        case 'GET_COMMENTS':
            return [...action.payload];

        case 'ADD_COMMENT':
            return [action.payload, ...state.slice(0, -1)];

        case 'EDIT_COMMENT':
            return state.map(editComment => editComment._id === action.payload._id ? { ...editComment, comment: action.payload.comment } : editComment);

        case 'CLEAR_COMMENTS':
            return [];

        default:
            return state;
    }
};
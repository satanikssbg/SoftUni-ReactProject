const commentsReducer = (state, action) => {
    switch (action?.type) {
        case 'GET_ALL_COMMENTS':
            return [...action.payload];

        case 'ADD_COMMENT':
            return [...state, action.payload];

        case 'EDIT_COMMENT':
            return state.map(comment => comment._id === action.payload._id ? { ...comment, text: action.payload.text } : comment);

        default:
            return state;
    }
}

export default commentsReducer;
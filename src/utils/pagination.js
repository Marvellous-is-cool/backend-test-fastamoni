//  helper for consistent pagination across endpoints
const getPaginationParams = (query) => {
  try {
    let page = parseInt(query.page) || 1;
    let limit = parseInt(query.limit) || 10;

    // validate page and limit
    if (page < 1) page = 1;
    if (limit < 1) limit = 10;
    if (limit > 100) limit = 100; // max limit

    const skip = (page - 1) * limit;

    return { page, limit, skip };
  } catch (error) {
    console.error("Pagination Params Error:", error.message);
    return { page: 1, limit: 10, skip: 0 };
  }
};

const formatPaginatedResponse = (data, page, limit, totalCount) => {
  return {
    data,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      hasNext: page < Math.ceil(totalCount / limit),
      hasPrev: page > 1,
    },
  };
};

export { getPaginationParams, formatPaginatedResponse };

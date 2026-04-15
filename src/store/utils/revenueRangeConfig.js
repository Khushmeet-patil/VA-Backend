exports.getGroupConfig = (range, dateField = "createdAt") => {
  switch (range) {
    case "daily":
      return {
        groupId: {
          date: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: `$${dateField}`,
              timezone: "Asia/Kolkata",
            },
          },
        },
        step: "day",
      };

    case "weekly":
      return {
        groupId: {
          date: {
            $dateToString: {
              format: "%Y-W%V", // 🔥 week number
              date: `$${dateField}`,
              timezone: "Asia/Kolkata",
            },
          },
        },
        step: "week",
      };

    case "monthly":
      return {
        groupId: {
          date: {
            $dateToString: {
              format: "%Y-%m",
              date: `$${dateField}`,
              timezone: "Asia/Kolkata",
            },
          },
        },
        step: "month",
      };

    case "yearly":
      return {
        groupId: {
          date: {
            $dateToString: {
              format: "%Y",
              date: `$${dateField}`,
              timezone: "Asia/Kolkata",
            },
          },
        },
        step: "year",
      };

    default:
      throw new Error("Invalid range");
  }
};

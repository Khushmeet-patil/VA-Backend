exports.getMonthRanges = (
  range = "monthly",
  startDate = null,
  endDate = null
) => {
  const now = new Date();
  let start;
  let end;

  switch (range) {
    /* ================= DAILY ================= */
    case "daily":
      start = new Date(now);
      start.setHours(0, 0, 0, 0);

      end = new Date(now);
      end.setHours(23, 59, 59, 999);
      break;

    /* ================= WEEKLY (MON → SUN) ================= */
    case "weekly": {
      const day = now.getDay() || 7; // Sun = 7
      start = new Date(now);
      start.setDate(now.getDate() - day + 1);
      start.setHours(0, 0, 0, 0);

      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;
    }

    /* ================= MONTHLY ================= */
    case "monthly":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      start.setHours(0, 0, 0, 0);

      end = new Date(now);
      end.setHours(23, 59, 59, 999);
      break;

    /* ================= YEARLY ================= */
    case "yearly":
      start = new Date(now.getFullYear(), 0, 1);
      start.setHours(0, 0, 0, 0);

      end = new Date(now);
      end.setHours(23, 59, 59, 999);
      break;

    /* ================= CUSTOM ================= */
    case "custom":
      if (!startDate || !endDate) {
        throw new Error("Start & end date required");
      }
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);

      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      break;

    default:
      throw new Error("Invalid range");
  }

  return { start, end };
};

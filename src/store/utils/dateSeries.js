exports.generateSeries = (start, end, step) => {
  const dates = [];
  const current = new Date(start);

  while (current <= end) {
    dates.push(new Date(current));

    if (step === "day") current.setDate(current.getDate() + 1);
    if (step === "week") current.setDate(current.getDate() + 7);
    if (step === "month") current.setMonth(current.getMonth() + 1);
    if (step === "year") current.setFullYear(current.getFullYear() + 1);
  }

  return dates;
};

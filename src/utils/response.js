export const success = (res, data, message = "Success") =>
  res.status(200).json({ success: true, message, data });

export const fail = (res, message = "Failed", code = 400) =>
  res.status(code).json({ success: false, message });

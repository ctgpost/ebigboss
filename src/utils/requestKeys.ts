export const createClientRequestId = (scope: string) => {
  const cryptoId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `${scope}-${Date.now()}-${cryptoId}`;
};

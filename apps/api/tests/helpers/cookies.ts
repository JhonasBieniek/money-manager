export function hasSetCookie(
  setCookie: string | string[] | undefined,
  name: string,
): boolean {
  const cookies = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  return cookies.some((entry) => entry.startsWith(`${name}=`));
}

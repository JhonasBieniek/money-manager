import lusca from "lusca";

export const CSRF_COOKIE_NAME = "_csrf";
export const CSRF_HEADER_NAME = "x-xsrf-token";

export const csrfProtection = lusca({
  csrf: {
    cookie: {
      name: CSRF_COOKIE_NAME,
      options: {
        httpOnly: false,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      },
    },
    header: CSRF_HEADER_NAME,
  },
});

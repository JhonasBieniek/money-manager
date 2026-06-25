import session from "express-session";
import { getJwtRefreshSecret } from "../../config/secrets.js";

export function createSessionMiddleware() {
  return session({
    secret: getJwtRefreshSecret(),
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  });
}

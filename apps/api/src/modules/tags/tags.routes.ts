import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import * as tagsController from "./tags.controller.js";

export const tagsRoutes = Router();

tagsRoutes.get("/", authenticate, tagsController.list);
tagsRoutes.post("/", authenticate, tagsController.create);
tagsRoutes.get("/:id", authenticate, tagsController.get);
tagsRoutes.patch("/:id", authenticate, tagsController.update);
tagsRoutes.delete("/:id", authenticate, tagsController.remove);

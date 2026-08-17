import { Router } from 'express';
import { AppError } from './errors';

export interface PlannedEndpoint {
  method: string;
  path: string;
  desc: string;
}

/**
 * Builds a router for a module that is structured but not yet implemented.
 * Any request returns 501 with the list of planned endpoints, so the API
 * boots and the surface area is documented while modules are filled in one by
 * one — each following the Auth/Users controller→service→repository pattern.
 */
export const scaffoldRouter = (module: string, planned: PlannedEndpoint[]): Router => {
  const router = Router();
  router.use((_req, _res, next) => {
    next(
      AppError.notImplemented(
        `The "${module}" module is scaffolded but not implemented yet`,
        planned.map((p) => ({ path: `${p.method} ${p.path}`, message: p.desc })),
      ),
    );
  });
  return router;
};

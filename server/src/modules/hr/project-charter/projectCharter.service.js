import {
  POOLS,
  withConnection as defaultWithConnection,
  withTransaction as defaultWithTransaction,
} from '../../../database/oracle.js';

import { AppError } from '../../../shared/errors/AppError.js';

import * as defaultRepository from './projectCharter.repository.js';

const missing = () => new AppError(404, 'NOT_FOUND', 'Project charter not found');

const invalid = (field, message) =>
  new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field, message }]);

const ensureDates = (p) => {
  if (
    !Number.isFinite(Date.parse(`${p.expectedStartDate}T00:00:00Z`)) ||
    !Number.isFinite(Date.parse(`${p.expectedEndDate}T00:00:00Z`)) ||
    p.expectedEndDate < p.expectedStartDate
  ) {
    throw invalid('expectedEndDate', 'expectedEndDate must be on or after expectedStartDate');
  }
};

const allowPending = (header) => {
  if (header.status !== 'Pending') {
    throw new AppError(409, 'STATE_CONFLICT', 'Charter is not Pending and cannot be modified');
  }
};

export function createProjectCharterService({
  repository = defaultRepository,
  withConnection = defaultWithConnection,
  withTransaction = defaultWithTransaction,
} = {}) {
  const read = (fn) => withConnection(POOLS.LOW, fn);

  const tx = (fn) => withTransaction(POOLS.LOW, fn);

  const find = async (c, id, lock = false) => {
    const h = await repository.findCharter(c, id, lock);

    if (!h) {
      throw missing();
    }

    return h;
  };

  const approved = async (c, id) => {
    const idea = await repository.findApprovedIdea(c, id);

    if (!idea) {
      throw invalid('ideaId', 'An approved idea is required');
    }

    return idea;
  };

  return {
    async list(_actor, query) {
      return read((c) => repository.listCharters(c, query));
    },

    async get(_actor, id) {
      return read((c) => find(c, id));
    },

    async create(_actor, payload) {
      ensureDates(payload);

      // No verified sequence or identity generator
      // was found for XXZP_PRJ_CHARTER.HEADER_ID.
      //
      // Do not use MAX+1 or invent a sequence name.
      // Creation remains blocked until verified.

      throw new AppError(
        503,
        'CHARTER_ID_GENERATOR_UNVERIFIED',
        'Project Charter creation is unavailable until a database-generated HEADER_ID mechanism is verified',
      );
    },

    async update(_actor, id, payload) {
      ensureDates(payload);

      return tx(async (c) => {
        const existing = await find(c, id, true);

        allowPending(existing);

        const idea = await approved(c, existing.ideaId);

        const result = await repository.updateCharter(
          c,
          id,
          {
            ...payload,
            preparedBy: payload.preparedBy ?? existing.preparedBy,
          },
          idea,
        );

        if (!result) {
          throw new AppError(409, 'STATE_CONFLICT', 'Charter can no longer be updated');
        }

        return find(c, id);
      });
    },

    async remove(_actor, id) {
      return tx(async (c) => {
        const existing = await find(c, id, true);

        allowPending(existing);

        return repository.removeCharter(c, id);
      });
    },

    async reward(_actor, id) {
      return read(async (c) => {
        const header = await find(c, id);

        const idea = await approved(c, header.ideaId);

        const record = await repository.getReward(c, id);

        return {
          headerId: header.headerId,
          idea,
          record,
          gradingEnabled: false,
        };
      });
    },

    async updateReward(_actor, id, _payload) {
      await read((c) => find(c, id));

      throw new AppError(
        409,
        'REWARD_GRADING_UNCONFIRMED',
        'Reward grading writes are disabled until business thresholds are approved',
      );
    },

    async ideas() {
      return read((c) => repository.listIdeas(c));
    },

    async idea(_actor, id) {
      return read((c) => approved(c, id));
    },

    async employees(_actor, query) {
      return read((c) => repository.listEmployees(c, query));
    },

    async employee(_actor, id) {
      return read(async (c) => {
        const found = await repository.findEmployee(c, id);

        if (!found) {
          throw new AppError(404, 'NOT_FOUND', 'Employee not found');
        }

        return found;
      });
    },

    async profile(actor) {
      return read((c) => repository.findActorProfile(c, actor.userId));
    },
  };
}

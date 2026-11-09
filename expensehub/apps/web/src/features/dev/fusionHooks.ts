// D-36 dev Fusion simulator hooks — imported only by the dev-only, lazy simulator page.
import { devFusionStateSchema, type SimulatorActionName } from '@expensehub/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useFinanceMutation } from '../payables/hooks';

const FUSION = '/dev/fusion';

export const useDevFusion = () =>
  useQuery({
    queryKey: ['dev', 'fusion'],
    queryFn: ({ signal }) => api(FUSION, devFusionStateSchema, { signal }),
  });

export const useSimulatorAction = () =>
  useFinanceMutation(({ invoiceId, action }: { invoiceId: number; action: SimulatorActionName }) =>
    api(`${FUSION}/invoices/${invoiceId}/${action}`, devFusionStateSchema, {
      method: 'POST',
      body: {},
    }),
  );

export const useAutoAdvance = () =>
  useFinanceMutation((enabled: boolean) =>
    api(`${FUSION}/auto-advance`, devFusionStateSchema, { method: 'POST', body: { enabled } }),
  );

export const useFailNext = () =>
  useFinanceMutation((httpStatus: 400 | 500) =>
    api(`${FUSION}/fail-next`, devFusionStateSchema, {
      method: 'POST',
      body: { target: 'createInvoice', httpStatus },
    }),
  );

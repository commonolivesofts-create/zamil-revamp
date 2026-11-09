-- SICK-LEAVE-HALF-DAYS-001 rollback. Destructive to stored half-day selections.
-- Run only if no half-day or fractional leave request has been saved since migration.
-- LEAVE_DAYS remains unconstrained NUMBER; its previous precision and scale are unknown.

DECLARE
  v_non_full PLS_INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO v_non_full
    FROM XXZP.XXZP_SICK_LEAVE
   WHERE FROM_DAY_TYPE <> 'FULL'
      OR TO_DAY_TYPE <> 'FULL'
      OR LEAVE_DAYS <> TRUNC(LEAVE_DAYS);

  IF v_non_full <> 0 THEN
    RAISE_APPLICATION_ERROR(-20006, 'Rollback stopped: half-day or fractional sick leave data exists');
  END IF;

  EXECUTE IMMEDIATE
    'ALTER TABLE XXZP.XXZP_SICK_LEAVE DROP CONSTRAINT XXZP_SL_FROM_DAY_TYPE_CK';
  EXECUTE IMMEDIATE
    'ALTER TABLE XXZP.XXZP_SICK_LEAVE DROP CONSTRAINT XXZP_SL_TO_DAY_TYPE_CK';
  EXECUTE IMMEDIATE
    'ALTER TABLE XXZP.XXZP_SICK_LEAVE DROP (FROM_DAY_TYPE, TO_DAY_TYPE)';
END;
/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validate } from '../src/middleware/validate.js';
import { dbText } from '../src/modules/hr/formText.validation.js';
import { createBodySchema as requisition } from '../src/modules/hr/requisitions/requisition.validation.js';
import { writeBodySchema as interview } from '../src/modules/hr/interview-assessments/interviewAssessment.validation.js';
import { writeBodySchema as offer } from '../src/modules/hr/employment-offers/employmentOffer.validation.js';
import { createBodySchema as orientation } from '../src/modules/hr/orientation-trainings/orientationTraining.validation.js';
import { updateBodySchema as probation } from '../src/modules/hr/probation-evaluations/probationEvaluation.validation.js';

test('Oracle byte limits accept the boundary, reject an Arabic overflow, and preserve note line breaks', () => {
  const notes = dbText(500, { required: true, multiline: true });
  assert.equal(notes.validate('ع'.repeat(250)).error, undefined);
  assert.match(notes.validate('ع'.repeat(251)).error.message, /500-byte limit/);
  assert.equal(notes.validate('  First line\r\nSecond line  ').value, 'First line\nSecond line');
  assert.equal(dbText(150).validate('  Job   title  ').value, 'Job title');
});

test('all five write schemas reject values wider than their stored Oracle columns', () => {
  const cases = [
    [requisition.extract('jobName'), 'ع'.repeat(76), '150-byte'],
    [interview.extract('personalSpec.remark1'), 'ع'.repeat(101), '200-byte'],
    [offer.extract('line.comment'), 'ع'.repeat(251), '500-byte'],
    [probation.extract('comment'), 'ع'.repeat(251), '500-byte'],
  ];
  for (const [schema, value, message] of cases) {
    assert.match(schema.validate(value).error.message, new RegExp(message));
  }
  const orientationError = orientation.validate({
    empNo: 'E100',
    fromOrient: '2026-11-06',
    lines: [{ department: 'HR', remarks: 'ع'.repeat(501) }],
  }).error;
  assert.match(orientationError.message, /1000-byte/);
  assert.ok(interview.extract('age').validate(17).error);
  assert.equal(interview.extract('age').validate(18).error, undefined);
  assert.ok(offer.extract('reqNo').validate('REQ-2048').error);
});

test('orientation API reports the later row for overlapping times, including seconds', () => {
  const first = {
    department: 'HR',
    fromDate: '2026-11-06',
    toDate: '2026-11-06',
    timeFrom: '12:00:30',
    timeTo: '13:00:00',
  };
  const second = { ...first, department: 'Safety', timeFrom: '12:59:59', timeTo: '14:00:00' };
  const req = { body: { empNo: 'E100', fromOrient: '2026-11-06', lines: [first, second] } };
  let failure;
  validate({ body: orientation })(req, {}, (error) => {
    failure = error;
  });
  assert.equal(failure?.code, 'VALIDATION_ERROR');
  assert.equal(failure.details[0].field, 'lines.1.timeFrom');
  assert.match(failure.details[0].message, /overlaps with row 1/);
  req.body.lines[1].timeFrom = '13:00:00';
  failure = undefined;
  validate({ body: orientation })(req, {}, (error) => {
    failure = error;
  });
  assert.equal(failure, undefined);
});

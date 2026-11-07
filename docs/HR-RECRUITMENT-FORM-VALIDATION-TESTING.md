# HR recruitment form validation: manual test guide

Use a test account with permission to create and edit these five forms. For each case, use a new draft or a record that can be edited. Check that the error appears beside the correct field, the form opens its tab and focuses the first problem, and the invalid value is **not saved**. After fixing it, save and reopen the record to verify the saved value.

Oracle text columns in these forms use **byte** limits. In UTF-8, an ordinary English letter is usually one byte and an Arabic letter is usually two bytes. A browser character limit alone does not prove the value will fit. For the byte-limit cases below, paste Arabic text that is still under the visible character limit.

## 1. Personnel requisition

| Action | Expected result |
| --- | --- |
| Enter 76 Arabic letters as a free-text Job title (152 bytes). Continue or Save. | Job title shows a 150-byte limit error. It is not saved. |
| Enter more than 1,000 bytes in Remark or Reason for addition. | The relevant field shows its 1,000-byte limit. |
| Add enough Skills tags that their joined value exceeds 2,000 bytes, or enter more than 2,000 bytes in Other requirements. | The correct field shows a 2,000-byte limit. |
| Enter `12e3`, `-5`, `abc`, or `12.345` in Budgeted salary. | The field asks for a nonnegative salary with up to two decimal places. |
| Enter repeated spaces in Job title and save a valid form. | The saved title has single internal spaces and no leading/trailing spaces. |
| Enter a two-line Remark within its byte limit. | It saves and reopens with the line break intact. |

## 2. Interview assessment

| Action | Expected result |
| --- | --- |
| Enter `abc`, `2e1`, `17`, `71`, or `20.5` as Age. | Age shows “Enter a whole-number age from 18 to 70.” The value is not saved. |
| Enter `18` and `70` as Age in separate valid drafts. | Both boundary values are accepted. |
| Enter `-1`, `1.5`, or `51` in Relevant experience years. | The field asks for a whole number from 0 to 50. |
| Enter `1e3`, `-2`, or more than two decimals in a salary field. | The field asks for a nonnegative amount with up to two decimal places. |
| Enter 101 Arabic letters in a rating remark (202 bytes, under the 200-character input limit). | That specific remark shows a 200-byte limit error. |
| Enter 101 Arabic letters in Strengths or Weakness. | That summary shows a 200-byte limit error. |
| Enter more than 50 bytes in Department representative, HR comment, or Interviewer 1. | The relevant field shows a 50-byte limit error. |
| Enter a two-line Strengths summary within 200 bytes. | It saves and reopens with the line break intact. |

## 3. Employment offer

| Action | Expected result |
| --- | --- |
| Enter 251 Arabic letters in Comments (502 bytes, under the 500-character input limit). | Comments shows a 500-byte limit error. |
| Enter 251 Arabic letters in an Arabic benefit value. | That benefit's Arabic input shows a 500-byte limit error. |
| Enter 51 Arabic letters in the Arabic starting-date text. | The input shows a 100-byte limit error. |
| Enter a two-line Comment within 500 bytes. | It saves and reopens with its line break. |
| Select a valid candidate and complete the mandatory date and offer details. | The offer saves, and the live and print previews still render. |
| If a linked requisition number contains letters, attempt Save. | The Requisition number field explains that the linked number must contain digits only. |

## 4. Orientation training

| Action | Expected result |
| --- | --- |
| Select an employee and set the orientation date. | New training rows inherit that date. |
| Set Training with HR Dept to 12:00:00–13:00:00, then set another training on the same date to 12:00:00–13:00:00. | The second row shows an overlap error and cannot be saved. |
| Change the second training to 13:00:00–14:00:00. | The adjacent time is accepted. |
| Set a row's To time equal to its From time. | To time asks for a later time. |
| Remove just one date or one time from a row. | The missing matching date or time is identified. |
| Set matching times on nonoverlapping dates. | They are accepted. |
| Enter more than 1,000 bytes in a row Remark. | That row's Remark shows a 1,000-byte limit error. |

## 5. Probation evaluation

| Action | Expected result |
| --- | --- |
| Save a new draft with valid employee, form type, and evaluation period. | The draft saves; optional initial ratings remain supported. |
| On the saved form, enter 251 Arabic letters in Comments or Suggestion. | That field shows a 500-byte limit error. |
| Leave either Comments or Suggestion blank, or omit a required rating. | The corresponding field or criterion explains what is missing. |
| Use two-line Comments and Suggestion within 500 bytes, and rate all criteria. | The changes save and reopen with both line breaks. |

## API and accessibility checks

1. Use an authenticated direct API request to bypass browser validation. A rejected value should return HTTP 400 with `VALIDATION_ERROR`, a field path such as `line.comment` or `lines.1.timeFrom`, and a useful message. No Oracle error should be shown to the user.
2. Try the same orientation overlap through a direct API request. The API must reject it even when browser validation is bypassed.
3. Use only the keyboard to trigger an error. Focus should move to the first invalid input on the relevant tab, and its message should be linked with `aria-describedby` where the component supports it.
4. Correct the first invalid input and try again. The old error should disappear; any remaining errors should identify their own fields.

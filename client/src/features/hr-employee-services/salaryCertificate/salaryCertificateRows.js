// The five salary rows of the certificate, with their labels in both languages.
// Shared by the form and its preview, and kept out of the component file so fast
// refresh stays component-only.
export const SALARY_ROWS = Object.freeze([
  ['basicSalary', 'Basic salary', 'الراتب الأساسي'], ['housingAllowance', 'Housing allowance', 'بدل سكن'],
  ['transportAllowance', 'Transportation allowance', 'بدل مواصلات'], ['commAllowance', 'Communication allowance', 'بدل اتصال'],
  ['carAllowance', 'Car allowance', 'بدل سيارة'],
])

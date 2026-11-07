export function createVisitingVisaController({ service: s }) {
  return {
    list: async (req, res) => {
      const { total, items } = await s.list(req.query);
      const { page = 1, limit = 10 } = req.query;

      res.json({
        success: true,
        data: {
          pagination: {
            total_records: total,
            total_pages: limit ? Math.ceil(total / limit) : 1,
            current_page: page,
            limit,
          },
          letters: items,
        },
      });
    },

    get: async (req, res) =>
      res.json({
        success: true,
        data: await s.get(req.params.id),
      }),

    create: async (req, res) =>
      res.status(201).json({
        success: true,
        data: await s.create(req.auth, req.body),
      }),

    update: async (req, res) =>
      res.json({
        success: true,
        data: await s.update(req.auth, req.params.id, req.body),
      }),

    remove: async (req, res) =>
      res.json({
        success: true,
        data: await s.remove(req.auth, req.params.id),
      }),

    employees: async (req, res) =>
      res.json({
        success: true,
        data: await s.employees(req.query),
      }),

    employee: async (req, res) =>
      res.json({
        success: true,
        data: await s.employee(req.params.employeeNumber),
      }),

    options: async (req, res) =>
      res.json({
        success: true,
        data: s.options(),
      }),

    print: async (req, res) =>
      res.json({
        success: true,
        data: await s.print(req.params.id),
      }),

    export: async (req, res) => {
      const { items } = await s.list({
        ...req.query,
        limit: 0,
      });

      const headers = [
        'id',
        'ref_no',
        'division_id',
        'employee_name',
        'embassy',
        'subject',
        'status',
        'letter_date',
        'created_at',
        'updated_at',
      ];

      const cell = (v) =>
        `"${String(v ?? '')
          .replace(/^[=+@-]/, (x) => `'${x}`)
          .replace(/"/g, '""')}"`;

      const csv = [
        headers.join(','),
        ...items.map((row) => headers.map((k) => cell(row[k])).join(',')),
      ].join('\r\n');

      res
        .type('text/csv')
        .attachment(
          `business_visa_letters_${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}.csv`,
        )
        .send(csv);
    },
  };
}

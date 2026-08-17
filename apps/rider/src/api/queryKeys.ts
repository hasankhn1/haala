export const qk = {
  me: ['me'] as const,
  rider: ['rider'] as const,
  queue: ['rider', 'queue'] as const,
  assignments: ['delivery', 'assignments'] as const,
  assignment: (id: string) => ['delivery', 'assignment', id] as const,
};

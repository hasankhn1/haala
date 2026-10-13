/** The pill after a form label saying whether the field must be filled. */
export function FieldTag({ required = false }: { required?: boolean }) {
  return (
    <span className="field-tag">
      {required ? 'Required' : 'Optional'}
    </span>
  );
}

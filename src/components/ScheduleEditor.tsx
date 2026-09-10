interface ScheduleEditorProps {
  value: number[];
  onChange: (value: number[]) => void;
}

export default function ScheduleEditor({ value, onChange }: ScheduleEditorProps) {
  function updateAt(index: number, jours: number) {
    onChange(value.map((v, i) => (i === index ? jours : v)));
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function add() {
    const last = value[value.length - 1] ?? 0;
    onChange([...value, last + 15]);
  }

  return (
    <div className="flex flex-col gap-2">
      {value.map((jours, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="text-sm text-gray">Niveau {index + 1} : J+</span>
          <input
            type="number"
            min={1}
            value={jours}
            onChange={(e) => updateAt(index, Number(e.target.value))}
            className="w-20 rounded-md border border-line px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={() => removeAt(index)}
            disabled={value.length === 1}
            className="text-red-600 disabled:opacity-30"
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className="self-start text-xs font-medium text-electric-dark">
        + Ajouter un palier
      </button>
    </div>
  );
}

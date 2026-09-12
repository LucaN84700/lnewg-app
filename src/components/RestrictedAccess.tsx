export default function RestrictedAccess({ title, message }: { title: string; message: string }) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-navy">{title}</h1>
      <div className="mt-6 max-w-lg rounded-xl border border-line bg-white p-6 text-sm">
        <p className="font-semibold text-navy">Accès restreint</p>
        <p className="mt-2 text-gray">{message}</p>
      </div>
    </div>
  );
}

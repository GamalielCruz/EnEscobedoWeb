type LoadingOrbsProps = {
  label?: string;
};

export function LoadingOrbs({ label = "Cargando..." }: LoadingOrbsProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-3 text-sm font-medium text-gray-600"
    >
      <span className="flex h-7 items-center gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((orb) => (
          <span
            key={orb}
            className="loading-orb h-2.5 w-2.5 rounded-full bg-[#eb1902]"
            style={{ animationDelay: `${orb * 120}ms` }}
          />
        ))}
      </span>
      <span>{label}</span>
    </div>
  );
}

function Loader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center bg-white px-4">
      <LoadingOrbs />
    </div>
  );
}

export default Loader;

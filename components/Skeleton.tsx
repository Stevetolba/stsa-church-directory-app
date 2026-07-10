export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={`animate-pulse rounded-md bg-[#EAE2D0]/60 ${className}`} style={style} />;
}

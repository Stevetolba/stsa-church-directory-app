export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={`animate-pulse rounded-md bg-[#CBD2D9]/60 ${className}`} style={style} />;
}

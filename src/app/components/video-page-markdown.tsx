import { color } from "@/lib/theme";

/**
 * Shared react-markdown overrides for per-video SSR pages (`/v/`) and the
 * client summary panel — keeps typography aligned with the SPA Videos page.
 */
export const videoPageMdComponents = {
  h2: ({ children, ...props }: React.ComponentProps<"h2">) => (
    <h2
      style={{
        color: color.gold,
        fontSize: 18,
        fontWeight: 700,
        margin: "24px 0 10px",
        textTransform: "uppercase",
      }}
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: React.ComponentProps<"h3">) => (
    <h3 style={{ color: color.gold, fontSize: 17, fontWeight: 700, lineHeight: 1.35, margin: "20px 0 4px" }} {...props}>{children}</h3>
  ),
  p: ({ children, ...props }: React.ComponentProps<"p">) => (
    <p style={{ color: color.textSecondary, fontSize: 15, lineHeight: 1.6, margin: "8px 0" }} {...props}>{children}</p>
  ),
  ul: ({ children, ...props }: React.ComponentProps<"ul">) => (
    <ul style={{ paddingLeft: 22, margin: "8px 0" }} {...props}>{children}</ul>
  ),
  li: ({ children, ...props }: React.ComponentProps<"li">) => (
    <li style={{ color: color.textSecondary, fontSize: 15, lineHeight: 1.6, marginBottom: 10 }} {...props}>{children}</li>
  ),
  strong: ({ children, ...props }: React.ComponentProps<"strong">) => (
    <strong style={{ color: color.text, fontWeight: 700 }} {...props}>{children}</strong>
  ),
};

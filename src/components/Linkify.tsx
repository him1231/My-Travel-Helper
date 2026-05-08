// Renders text with http(s) URLs converted to clickable links.
// Stops propagation on link clicks so embedding inside a clickable card
// (e.g. ActivityCard) opens the URL instead of selecting the card.
export default function Linkify({ text, className }: { text: string; className?: string }) {
  // Capturing group preserves URLs in split output
  const parts = text.split(/(https?:\/\/[^\s<>"]+)/g)
  return (
    <p className={className}>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="break-all text-sky-600 underline hover:text-sky-700"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  )
}

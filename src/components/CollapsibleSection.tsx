import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

interface ChevronProps {
  isCollapsed: boolean;
}

interface CollapsibleSectionProps {
  title: string;
  sectionName: string;
  isCollapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}

function Chevron({ isCollapsed }: ChevronProps) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      style={{
        transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)",
        transition: "transform 0.2s",
      }}
    >
      <path
        d="M4 2L8 6L4 10"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CollapsibleSection({
  title,
  sectionName: _sectionName,
  isCollapsed,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [maxHeight, setMaxHeight] = useState("none");

  useEffect(() => {
    if (contentRef.current) {
      setMaxHeight(isCollapsed ? "0px" : `${contentRef.current.scrollHeight}px`);
    }
  }, [isCollapsed, children]);

  return (
    <div className="sidebar-section">
      <h2
        onClick={onToggle}
        style={{
          cursor: "pointer",
          userSelect: "none",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <Chevron isCollapsed={isCollapsed} />
        {title}
      </h2>
      <div
        ref={contentRef}
        className={`section-content ${isCollapsed ? "collapsed" : ""}`}
        style={{ maxHeight }}
      >
        {children}
      </div>
    </div>
  );
}

export default CollapsibleSection;

"use client";

import { useState } from "react";

const links = [
  { href: "#workflow", label: "Workflow" },
  { href: "#simulation", label: "Safety check" },
  { href: "#review", label: "Review signature" },
];

export function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mobile-menu">
      <button
        className="menu-button"
        type="button"
        aria-expanded={isOpen}
        aria-controls="mobile-navigation"
        aria-label={isOpen ? "Close navigation" : "Open navigation"}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span aria-hidden="true">{isOpen ? "×" : "☰"}</span>
      </button>
      {isOpen ? (
        <div className="mobile-menu-panel" id="mobile-navigation">
          {links.map((link) => (
            <a
              href={link.href}
              key={link.href}
              onClick={() => setIsOpen(false)}
            >
              {link.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

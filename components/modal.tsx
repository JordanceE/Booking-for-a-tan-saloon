"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export default function Modal({
  title,
  children,
  onClose,
  busy = false,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    ref.current?.querySelector("input")?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`.trim()}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <button
        className="icon-button modal-close"
        aria-label="Close dialog"
        onClick={onClose}
        disabled={busy}
      >
        <X size={20} />
      </button>
      <h2 id="modal-title">{title}</h2>
      {children}
    </dialog>
  );
}

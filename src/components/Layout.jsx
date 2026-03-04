import { WhatsAppButton } from "./WhatsAppButton";

export function Layout({ children }) {
  return (
    <>
      {children}
      <WhatsAppButton />
    </>
  );
}

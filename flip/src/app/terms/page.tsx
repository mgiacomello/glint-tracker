"use client";

import { SubPage } from "@/components/SubPage";
import { useT } from "@/lib/i18n/provider";

export default function TermsPage() {
  const t = useT();
  return (
    <SubPage title={t("legal.terms.title")} subtitle={t("legal.updated")}>
      <div className="space-y-4 text-content-soft">
        <H>{t("legal.terms.what.title")}</H>
        <P>
          {t("legal.terms.what.body1")}
          <b>{t("legal.terms.what.bold")}</b>
          {t("legal.terms.what.body2")}
        </P>

        <H>{t("legal.terms.noAdvice.title")}</H>
        <P>{t("legal.terms.noAdvice.body")}</P>

        <H>{t("legal.terms.properUse.title")}</H>
        <Ul
          items={[
            t("legal.terms.properUse.1"),
            t("legal.terms.properUse.2"),
            t("legal.terms.properUse.3"),
          ]}
        />

        <H>{t("legal.terms.liability.title")}</H>
        <P>{t("legal.terms.liability.body")}</P>

        <H>{t("legal.terms.account.title")}</H>
        <P>{t("legal.terms.account.body")}</P>

        <H>{t("legal.terms.contact.title")}</H>
        <P>
          {t("legal.terms.contact.prefix")}
          <a className="text-flip-600" href="mailto:marco@giacomello.digital">
            marco@giacomello.digital
          </a>
          .
        </P>
      </div>
    </SubPage>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="pt-2 text-lg font-bold text-content">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="leading-relaxed">{children}</p>;
}
function Ul({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 leading-relaxed">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

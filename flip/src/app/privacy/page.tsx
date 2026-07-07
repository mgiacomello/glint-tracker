"use client";

import { SubPage } from "@/components/SubPage";
import { useT } from "@/lib/i18n/provider";

export default function PrivacyPage() {
  const t = useT();
  return (
    <SubPage title={t("legal.privacy.title")} subtitle={t("legal.updated")}>
      <div className="prose-flip space-y-4 text-content-soft">
        <P>
          {t("legal.privacy.intro")}
          <a className="text-flip-600" href="mailto:marco@giacomello.digital">
            marco@giacomello.digital
          </a>
          .
        </P>

        <H>{t("legal.privacy.data.title")}</H>
        <Ul
          items={[
            t("legal.privacy.data.1"),
            t("legal.privacy.data.2"),
            t("legal.privacy.data.3"),
            t("legal.privacy.data.4"),
          ]}
        />

        <H>{t("legal.privacy.ai.title")}</H>
        <P>{t("legal.privacy.ai.body")}</P>

        <H>{t("legal.privacy.storage.title")}</H>
        <P>{t("legal.privacy.storage.body")}</P>

        <H>{t("legal.privacy.retention.title")}</H>
        <P>{t("legal.privacy.retention.body")}</P>

        <H>{t("legal.privacy.rights.title")}</H>
        <Ul
          items={[
            t("legal.privacy.rights.1"),
            t("legal.privacy.rights.2"),
            t("legal.privacy.rights.3"),
            t("legal.privacy.rights.4"),
          ]}
        />
        <P>
          {t("legal.privacy.contact.prefix")}
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

import { useId } from "react";
import type { Address, OrderAddress } from "@/lib/types";
const COUNTRIES = [
  "Cambodia",
  "United States",
  "Canada",
  "Singapore",
  "Thailand",
  "United Kingdom",
  "Australia",
];
export function AddressFields({
  address = {},
  contact = false,
}: {
  address?: Partial<Address & OrderAddress>;
  contact?: boolean;
}) {
  const id = useId(),
    field = (
      name: keyof (Address & OrderAddress),
      label: string,
      props: React.ComponentProps<"input"> = {},
      full = false,
    ) => (
      <div className={full ? "field full" : "field"}>
        <label htmlFor={id + name}>{label}</label>
        <input
          id={id + name}
          name={name}
          defaultValue={String(address[name] ?? "")}
          {...props}
        />
      </div>
    );
  // key forces fresh defaults when a saved address is picked.
  return (
    <div className="form-grid" key={address.line1 ?? ""}>
      {contact &&
        field(
          "email",
          "Email address",
          {
            type: "email",
            autoComplete: "email",
            maxLength: 120,
            required: true,
          },
          true,
        )}
      {field(
        "label",
        "Address label",
        {
          defaultValue: address.label ?? "Home",
          maxLength: 30,
          required: true,
        },
        true,
      )}
      {field("firstName", "First name", {
        autoComplete: "given-name",
        maxLength: 50,
        required: true,
      })}
      {field("lastName", "Last name", {
        autoComplete: "family-name",
        maxLength: 50,
        required: true,
      })}
      {field(
        "line1",
        "Street address",
        { autoComplete: "address-line1", maxLength: 180, required: true },
        true,
      )}
      {field(
        "line2",
        "Apartment, suite, etc. (optional)",
        { autoComplete: "address-line2", maxLength: 100 },
        true,
      )}
      {field("city", "City", {
        autoComplete: "address-level2",
        maxLength: 70,
        required: true,
      })}
      {field("state", "State / province (optional)", {
        autoComplete: "address-level1",
        maxLength: 70,
      })}
      <div className="field">
        <label htmlFor={id + "country"}>Country</label>
        <select
          id={id + "country"}
          name="country"
          autoComplete="country-name"
          defaultValue={address.country ?? COUNTRIES[0]}
        >
          {COUNTRIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      {field("postalCode", "Postal code", {
        autoComplete: "postal-code",
        maxLength: 20,
        required: true,
      })}
      {field(
        "phone",
        "Phone number",
        {
          type: "tel",
          autoComplete: "tel",
          pattern: "[+0-9\\(\\) .\\-]{6,25}",
          maxLength: 25,
          required: true,
        },
        true,
      )}
    </div>
  );
}
export const addressFrom = (f: Record<string, string>) => ({
  label: f.label || "Home",
  firstName: f.firstName,
  lastName: f.lastName,
  line1: f.line1,
  line2: f.line2 ?? "",
  city: f.city,
  state: f.state ?? "",
  country: f.country,
  postalCode: f.postalCode,
  phone: f.phone,
});
export function AddressText({ a }: { a: Partial<OrderAddress> }) {
  return (
    <>
      {a.firstName} {a.lastName}
      <br />
      {a.line1}
      {a.line2 && (
        <>
          <br />
          {a.line2}
        </>
      )}
      <br />
      {a.city}
      {a.state && ", " + a.state} {a.postalCode}
      <br />
      {a.country}
      {a.phone && (
        <>
          <br />
          {a.phone}
        </>
      )}
    </>
  );
}

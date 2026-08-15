import countries from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";

countries.registerLocale(en);

export interface Country {
  code: string;
  nameEn: string;
  flag: string;
}

function countryFlag(code: string) {
  return [...code.toUpperCase()]
    .map((character) => String.fromCodePoint(127397 + character.charCodeAt(0)))
    .join("");
}

export const countryList: Country[] = Object.keys(countries.getAlpha2Codes())
  .map((code) => ({
    code: code.toLowerCase(),
    nameEn: countries.getName(code, "en") || code,
    flag: countryFlag(code)
  }))
  .sort((a, b) => a.nameEn.localeCompare(b.nameEn, "en"));

export function getCountry(code: string) {
  return countryList.find((country) => country.code === code.toLowerCase());
}

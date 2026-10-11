# Popohřební služba

Vyšetřovací TTRPG systém pro Foundry VTT 14. Výpravy vstupují do samostatných realit, sbírají vodítka a skládají případy na společné tabuli důkazů. MHD uzavírá návštěvy; odrazy umožňují návraty bez změny skutečného výsledku.

Aktuální verze: **0.13.3**, testovaná s Foundry **14.368**. Jde o verzi pro společné testování.

## Instalace přes manifest

V **Setup → Game Systems → Install System → Manifest URL** vlož:

```text
https://github.com/f-tuma/post-mortum-service/releases/latest/download/system.json
```

Poté vytvoř svět se systémem **Popohřební služba**. Stejný manifest slouží k následným aktualizacím; každé vydání stahuje ZIP své konkrétní verze.

## Úvodní případ: Zkáza rodu Tétů

Stáhni [přípravu Tétů](https://github.com/f-tuma/post-mortum-service/releases/latest/download/tetove.json).
Jako vypravěč otevři v levém panelu **Popohřební služba → Podklady a příprava → Importovat případ…** a vyber tento JSON.

Import vytvoří 9 NPC, 20 vodítek, 30 časových událostí a scény s gridem, dveřmi, stěnami a podlažími. Příprava se nachází také v `cases/tetove.json` uvnitř instalace systému.

Případ obsahuje informace pro vypravěče včetně řešení záhady. Při aktualizaci rozehraného případu můžeš zvolit pouze aktualizaci příručky.

## Co systém obsahuje

- Nativní deníky Avatarů a NPC, předměty a vodítka.
- Sektor PMS, recepci s výběrem případů a archiv služby.
- Společnou tabuli důkazů, časovou osu a akce v chatu.
- Tvorbu Avatarů v MHD, společnou energii a izolované herní smyčky.
- Portréty a automatické kruhové tokeny NPC s širším výřezem hlavy.

## Vydání

Tento repozitář obsahuje distribuovanou část systému. Pracovní podklady a testovací světy nejsou jeho součástí.

Po změně verze v `system.json` vytvoř odpovídající Git tag, například `v0.13.4`. Workflow ověří verzi, sestaví `pms.zip`, `system.json`, `tetove.json` a kontrolní součty, nahraje je do návrhu vydání a po dokončení uploadu jej zveřejní.

Lokální sestavení z kořene tohoto repozitáře:

```sh
python3 scripts/build-release.py --repo f-tuma/post-mortum-service --output dist/release
```

Pro ruční instalaci rozbal `pms.zip` do uživatelských dat `Data/systems/pms/` a restartuj Foundry.

Oficiální dokumentace: [Foundry — distribuce systémů](https://foundryvtt.com/article/system-development/), [GitHub — odkazy na vydání](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases).

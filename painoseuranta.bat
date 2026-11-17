@echo off
rem Kaynnistaa painoseurannan, kun tiedostoa tuplaklikataan.
rem %~dp0 = taman bat-tiedoston oma kansio, joten paino.py loytyy aina.
cd /d "%~dp0"
rem pythonw ajaa ohjelman ilman mustaa komentoikkunaa.
rem start "" kaynnistaa sen erikseen, jolloin tama bat-ikkuna sulkeutuu heti.
rem Jos sovellus ei aukea, aja "python paino.py" komentorivilla nahdaksesi virheen.
start "" pythonw paino.py

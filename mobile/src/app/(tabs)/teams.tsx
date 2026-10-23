import { router } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, TextInput, View } from "react-native";

import { REGIONS, regionName } from "@/content/hub";
import { useRegionFilter } from "@/ui/region-filter";
import { useData } from "@/db/live";
import { listClubs } from "@/db/clubs";
import { listTeams, myScope } from "@/db/repo";
import { divisionName } from "@/domain/divisions";
import {
  Button,
  Chip,
  Choice,
  EmptyState,
  Icon,
  PageTitle,
  Row,
  Screen,
  Section,
  Segmented,
} from "@/ui/components";
import { PlayersList } from "@/ui/players-list";
import { MeButton } from "@/ui/me-button";
import { TeamLogo } from "@/ui/photo";
import { colors, font, space } from "@/ui/theme";

export default function Teams() {
  const teams = useData(listTeams);
  const clubs = useData(listClubs) ?? [];
  const clubOf = new Map(clubs.map((c) => [c.id, c]));
  const scope = useData(myScope);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"teams" | "players">("teams");
  // Starts on the home region chosen in Me.
  const { value: region, setValue: setRegion } = useRegionFilter();

  const filtered = (teams ?? []).filter((t) => {
    if (region === "mine") return !!scope?.teamIds.has(t.id);
    if (
      region !== "all" &&
      (region === "sample" ? !t.is_sample : t.region !== region || t.is_sample)
    )
      return false;
    if (!q) return true;
    const s = q.toLowerCase();
    const club = t.club_id ? clubOf.get(t.club_id) : null;
    return (
      t.name.toLowerCase().includes(s) ||
      (t.short_name ?? "").toLowerCase().includes(s) ||
      (t.city ?? "").toLowerCase().includes(s) ||
      !!club?.name.toLowerCase().includes(s)
    );
  });

  const groups = [
    ...REGIONS.map((r) => ({
      key: r.code,
      title: `${r.name} · ${r.body}`,
      teams: filtered.filter((t) => t.region === r.code && !t.is_sample),
    })),
    {
      key: "other",
      title: "Other",
      teams: filtered.filter(
        (t) => !t.is_sample && !REGIONS.some((r) => r.code === t.region),
      ),
    },
    {
      key: "sample",
      title: "Sample teams",
      teams: filtered.filter((t) => t.is_sample),
    },
  ].filter((g) => g.teams.length);

  return (
    <Screen padded={false}>
      <View
        style={{
          paddingHorizontal: space.lg,
          paddingTop: space.lg,
          gap: space.md,
        }}
      >
        <PageTitle
          title="Teams"
          subtitle="Clubs, teams and players across South Africa"
          right={
            <View
              style={{
                flexDirection: "row",
                gap: space.sm,
                alignItems: "center",
              }}
            >
              <Button
                label="Add"
                icon="plus"
                onPress={() =>
                  Alert.alert("Add a…", undefined, [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Club (several teams)",
                      onPress: () => router.push("/club/edit"),
                    },
                    { text: "Team", onPress: () => router.push("/team/edit") },
                  ])
                }
              />
              <MeButton />
            </View>
          }
        />
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "teams", label: "Teams & clubs" },
            { value: "players", label: "Players" },
          ]}
        />
      </View>
      {mode === "players" ? (
        <PlayersList />
      ) : (
        <>
          <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: space.sm,
                backgroundColor: colors.surface,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: space.md,
              }}
            >
              <Icon name="magnify" color={colors.muted} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Search teams or towns"
                placeholderTextColor={colors.faint}
                style={{
                  flex: 1,
                  minHeight: 48,
                  fontFamily: font.regular,
                  fontSize: 16,
                  color: colors.ink,
                }}
              />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: space.sm }}
            >
              {[
                { code: "all", name: "All" },
                { code: "mine", name: "★ Mine & following" },
                ...REGIONS.map((r) => ({ code: r.code, name: r.name })),
                { code: "sample", name: "Samples" },
              ].map((r) => (
                <Choice
                  key={r.code}
                  label={r.name}
                  selected={region === r.code}
                  onPress={() => setRegion(r.code)}
                  style={{ minHeight: 40, paddingHorizontal: 14 }}
                />
              ))}
            </ScrollView>
          </View>
          {groups.length === 0 ? (
            <EmptyState
              icon={
                region === "mine" ? "star-outline" : "account-group-outline"
              }
              title={region === "mine" ? "No teams yet" : "No teams match"}
              body={
                region === "mine"
                  ? "Open any team — in any region — and tap Follow to keep an eye on it. Teams you play for show here too."
                  : "Try another search, or add the team."
              }
            />
          ) : (
            groups.map((g) => (
              <View key={g.key} style={{ paddingHorizontal: space.lg }}>
                <Section title={g.title}>
                  <View
                    style={{
                      borderRadius: 12,
                      overflow: "hidden",
                      borderWidth: 1,
                      borderColor: colors.border,
                      gap: 1,
                      backgroundColor: colors.divider,
                    }}
                  >
                    {[
                      ...new Set(
                        g.teams
                          .filter((t) => t.club_id && clubOf.has(t.club_id))
                          .map((t) => t.club_id!),
                      ),
                    ].map((cid) => {
                      const c = clubOf.get(cid)!;
                      const its = (teams ?? []).filter(
                        (t) => t.club_id === cid,
                      );
                      const mine = its.some((t) => scope?.myTeamIds.has(t.id));
                      return (
                        <Row
                          key={`club:${cid}`}
                          title={c.name}
                          subtitle={its
                            .map((t) => divisionName(t.division) || t.name)
                            .join(" · ")}
                          left={
                            <TeamLogo
                              uri={c.logo_uri}
                              color={c.primary_color}
                              size={32}
                            />
                          }
                          right={
                            mine ? (
                              <Chip label="My club" />
                            ) : (
                              <Chip
                                label={`${its.length} teams`}
                                tone="neutral"
                              />
                            )
                          }
                          onPress={() => router.push(`/club/${cid}`)}
                        />
                      );
                    })}
                    {g.teams
                      .filter((t) => !t.club_id || !clubOf.has(t.club_id))
                      .map((t) => (
                        <Row
                          key={t.id}
                          title={t.name}
                          subtitle={[
                            t.city,
                            t.region ? regionName(t.region) : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                          left={
                            <TeamLogo
                              uri={t.logo_uri}
                              color={t.primary_color}
                              size={32}
                            />
                          }
                          right={
                            scope?.myTeamIds.has(t.id) ? (
                              <Chip label="My team" />
                            ) : scope?.teamIds.has(t.id) ? (
                              <Icon name="star" color={colors.warn} />
                            ) : undefined
                          }
                          onPress={() => router.push(`/team/${t.id}`)}
                        />
                      ))}
                  </View>
                </Section>
              </View>
            ))
          )}
        </>
      )}
    </Screen>
  );
}

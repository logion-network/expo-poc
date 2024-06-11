import { StatusBar } from 'expo-status-bar';
import * as FileSystem from "expo-file-system";
import React, { PropsWithChildren, useCallback, useState } from 'react';
import { Button, StyleSheet, Text, View, useColorScheme } from 'react-native';
import {
    KeyringSigner,
    ClosedLoc,
    DraftRequest,
    HashOrContent,
    MimeType,
    LogionClient,
    InvitedContributorLoc,
} from '@logion/client';
import { ValidAccountId, UUID, Hash } from "@logion/node-api";
import { Keyring } from "@polkadot/api";
import { newLogionClient, ExpoFile } from '@logion/client-expo';
import { Buffer } from 'buffer';

import { LOGION_ENV, USER_SEED, LEGAL_OFFICER, LOGION_CLIENT_CONFIG, COLLECTION_LOC_ID } from './config';
import { Colors } from 'react-native/Libraries/NewAppScreen';

global.Buffer = Buffer;

export default function App() {
    const isDarkMode = useColorScheme() === 'dark';

    const backgroundStyle = {
        backgroundColor: isDarkMode ? Colors.darker : Colors.lighter,
    };

    const [client, setClient] = useState<LogionClient>();
    const [signer, setSigner] = useState<KeyringSigner>();
    const [accountId, setAccountId] = useState<ValidAccountId>();
    const [identityLoc, setIdentityLoc] = useState<ClosedLoc | null>();
    const [draftCollectionLoc, setDraftCollectionLoc] = useState<DraftRequest | null>();
    const [invitedContributorLoc, setInvitedContributorLoc] = useState<InvitedContributorLoc | null>();
    const [numberOfTokensRecords, setNumberOfTokensRecords] = useState<number>(0);
    const connect = useCallback(async () => {
        if (!client) {
            let createdClient = await getLogionClient();
            const keyring = new Keyring({ type: "sr25519" });
            const keypair = keyring.addFromUri(USER_SEED);
            const keyringSigner = new KeyringSigner(keyring);
            setSigner(keyringSigner);
            const accountId = ValidAccountId.polkadot(keypair.address);
            setAccountId(accountId);
            createdClient = createdClient.withCurrentAccount(accountId);
            const authenticatedClient = await createdClient.authenticate([accountId], keyringSigner);
            setClient(authenticatedClient);

            const locsState = await authenticatedClient.locsState();
            const legalOfficer = ValidAccountId.polkadot(LEGAL_OFFICER);
            const identityLoc = locsState.closedLocs["Identity"].find(loc => loc.owner.account.equals(legalOfficer));
            if (identityLoc) {
                setIdentityLoc(identityLoc as ClosedLoc);
            } else {
                setIdentityLoc(null);
            }

            const draftCollectionLoc = locsState.draftRequests["Collection"][0];
            if (draftCollectionLoc) {
                setDraftCollectionLoc(draftCollectionLoc as DraftRequest);
            } else {
                setDraftCollectionLoc(null);
            }

            let locId = UUID.fromAnyString(COLLECTION_LOC_ID);
            if (locId) {
                const closedCollectionLoc = await authenticatedClient.invitedContributor.findLocById({ locId })
                if (closedCollectionLoc) {
                    setNumberOfTokensRecords(await getNumberOfTokensRecords(authenticatedClient, locId));
                    setInvitedContributorLoc(closedCollectionLoc);
                } else {
                    setInvitedContributorLoc(null);
                }
            } else {
                setInvitedContributorLoc(null);
            }
        }
    }, [client]);

    const getNumberOfTokensRecords = useCallback(async (client: LogionClient, locId: UUID) => {
        return (await client.public.getTokensRecords({
            locId,
            jwtToken: client.tokens.get(),
        }))?.length || 0
    }, []);

    const writeFileAndGetContent = useCallback(async (idx: number) => {
        const fileName = `file${idx}.txt`;
        const path = `${FileSystem.cacheDirectory}/${fileName}`;
        await FileSystem.writeAsStringAsync(path, `test${idx}`);
        return HashOrContent.fromContent(new ExpoFile(path, fileName, MimeType.from("text/plain")));
    }, []);

    const getLogionClient = useCallback(async () => {
        if (LOGION_CLIENT_CONFIG) {
            return await LogionClient.create(LOGION_CLIENT_CONFIG);
        } else {
            return await newLogionClient(LOGION_ENV);
        }
    }, []);

    const addFile = useCallback(async () => {
        if (draftCollectionLoc) {
            const numberOfFiles = draftCollectionLoc.data().files.length;
            const file = await writeFileAndGetContent(numberOfFiles);
            let state = await draftCollectionLoc.addFile({
                file,
                nature: `Test ${numberOfFiles}`,
            }) as DraftRequest;
            setDraftCollectionLoc(state);
        }
    }, [signer, draftCollectionLoc]);

    const addTokensRecord = useCallback(async () => {
        if (client && signer && invitedContributorLoc) {
            const file = await writeFileAndGetContent(numberOfTokensRecords);
            const recordId = Hash.of(`Record #${numberOfTokensRecords}`);
            const description = `This is the Tokens Record #${numberOfTokensRecords}`;
            let state = await invitedContributorLoc.addTokensRecord({
                signer,
                payload: {
                    recordId,
                    description,
                    files: [file],
                }
            });
            setNumberOfTokensRecords(await getNumberOfTokensRecords(client, invitedContributorLoc.data.id));
            setInvitedContributorLoc(state);
        }
    }, [signer, invitedContributorLoc, client, numberOfTokensRecords]);

    return (
        <View style={styles.container}>
            <StatusBar style="auto" />
            {
                client === undefined &&
                <Section title="Logion">
                    <Button
                        title="Connect to Logion"
                        onPress={connect}
                    />
                </Section>
            }
            {
                signer !== undefined && accountId !== undefined &&
                <Section title="Logion AccountId">
                    {accountId.address}
                </Section>
            }
            {
                identityLoc !== undefined &&
                <Section title="Logion ID LOC">
                    ID: {identityLoc?.data().id.toDecimalString() || "None"}
                </Section>
            }
            {
                draftCollectionLoc !== undefined &&
                <Section title="Collection LOC">
                    ID: {draftCollectionLoc?.data().id.toDecimalString() || "None"}{"\n"}
                    Files: {draftCollectionLoc?.data().files.length.toString() || "-"}{"\n"}
                    <Button
                        title="Add file"
                        onPress={ addFile }
                    />
                </Section>
            }
            {
                invitedContributorLoc !== undefined &&
                <Section title="Invited Contributor Collection LOC">
                    ID: {invitedContributorLoc?.data.id.toDecimalString() || "None"}{"\n"}
                    Records: {numberOfTokensRecords.toString()}{"\n"}
                    <Button
                        title="Add tokens record"
                        onPress={ addTokensRecord }
                    />
                </Section>
            }
            <Section title="Help">
                <Text>Tap <Text style={{ fontWeight: "bold" }}>R</Text> key twice on your keyboard to refresh.</Text>
            </Section>
        </View>
    );
}

const styles = StyleSheet.create({
    sectionContainer: {
        marginTop: 32,
        paddingHorizontal: 24,
    },
    sectionTitle: {
        fontSize: 24,
        fontWeight: '600',
    },
    sectionDescription: {
        marginTop: 8,
        fontSize: 18,
        fontWeight: '400',
    },
    highlight: {
        fontWeight: '700',
    },
    label: {
        fontSize: 18,
        fontWeight: '400',
    },
    container: {
        flex: 1,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
});

type SectionProps = PropsWithChildren<{
    title: string;
}>;

function Section({ children, title }: SectionProps): JSX.Element {
    const isDarkMode = useColorScheme() === 'dark';
    return (
        <View style={styles.sectionContainer}>
            <Text
                style={[
                    styles.sectionTitle,
                    {
                        color: isDarkMode ? Colors.white : Colors.black,
                    },
                ]}>
                {title}
            </Text>
            <Text
                style={[
                    styles.sectionDescription,
                    {
                        color: isDarkMode ? Colors.light : Colors.dark,
                    },
                ]}>
                {children}
            </Text>
        </View>
    );
}

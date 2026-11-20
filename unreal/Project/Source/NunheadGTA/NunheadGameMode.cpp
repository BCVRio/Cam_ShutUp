#include "NunheadGameMode.h"
#include "NunheadGTA.h"
#include "Football.h"
#include "CamCharacter.h"
#include "NunheadHUD.h"
#include "BotPlayer.h"
#include "Kismet/GameplayStatics.h"
#include "EngineUtils.h"

ANunheadGameMode::ANunheadGameMode()
{
	PrimaryActorTick.bCanEverTick = true;
	DefaultPawnClass = ACamCharacter::StaticClass();
	HUDClass = ANunheadHUD::StaticClass();
}

void ANunheadGameMode::BeginPlay()
{
	Super::BeginPlay();
	for (TActorIterator<AFootball> It(GetWorld()); It; ++It) { Ball = *It; break; }
	TimeLeft = MatchLength;
	Feed(TEXT("Nunhead Green. Press F or X to charge a shot. Walk to the ball to kick off."), 6.f);
}

void ANunheadGameMode::StartMatch()
{
	ScoreHome = ScoreAway = 0; TimeLeft = MatchLength; bMatchOn = true; CelebrateT = 0;
	if (Ball) Ball->ResetToSpawn();
	Feed(TEXT("KICK OFF!  Bosco FC v Nunhead Rovers"), 3.f);
}

void ANunheadGameMode::EndMatch()
{
	bMatchOn = false;
	const FString Result = ScoreHome > ScoreAway ? TEXT("FULL TIME: Bosco win!") : ScoreHome < ScoreAway ? TEXT("FULL TIME: Rovers win") : TEXT("FULL TIME: a draw");
	Feed(Result, 6.f);
}

void ANunheadGameMode::Feed(const FString& Text, float Seconds) { Message = Text; MessageT = Seconds; UE_LOG(LogNunhead, Log, TEXT("%s"), *Text); }

void ANunheadGameMode::BallInGoal(AGoal* Goal, AFootball* InBall)
{
	if (!bMatchOn || CelebrateT > 0.f || ReplayLock > 0.f) return;
	// a keeper's throw-out is never a goal
	if (InBall->LastKicker == TEXT("keeper")) { InBall->ResetToSpawn(); Feed(TEXT("Goal kick")); return; }
	const bool bHomeScores = Goal->DefendingTeam == ETeam::Away;
	if (bHomeScores) ScoreHome++; else ScoreAway++;
	CelebrateT = 3.5f; ReplayLock = 1.f;
	Feed(bHomeScores ? TEXT("GOAL!!!  Bosco FC") : TEXT("Goal for the Rovers"), 3.5f);
	for (TActorIterator<ACamCharacter> It(GetWorld()); It; ++It) It->OnGoal(bHomeScores);
}

void ANunheadGameMode::Tick(float Dt)
{
	Super::Tick(Dt);
	if (MessageT > 0.f) { MessageT -= Dt; if (MessageT <= 0.f) Message.Empty(); }
	if (ReplayLock > 0.f) ReplayLock -= Dt;
	if (CelebrateT > 0.f) { CelebrateT -= Dt; if (CelebrateT <= 0.f && Ball) { Ball->ResetToSpawn(); for (TActorIterator<ABotPlayer> It(GetWorld()); It; ++It) It->ReturnHome(); } return; }
	if (!bMatchOn)
	{
		// the match starts the first time anyone kicks the ball
		if (Ball && !Ball->LastKicker.IsNone()) StartMatch();
		return;
	}
	TimeLeft -= Dt;
	if (TimeLeft <= 0.f) { TimeLeft = 0.f; EndMatch(); }
}

#include "NunheadGameMode.h"
#include "NunheadGTA.h"
#include "Football.h"
#include "CamCharacter.h"
#include "NunheadHUD.h"
#include "BotPlayer.h"
#include "Kismet/GameplayStatics.h"
#include "Components/AudioComponent.h"
#include "Sound/SoundBase.h"
#include "Sound/SoundWave.h"
#include "Scalability.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "UnrealClient.h"
#include "CollisionQueryParams.h"
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
	if (bForceEpicScalability) { Scalability::FQualityLevels L = Scalability::GetQualityLevels(); L.SetFromSingleQualityLevel(3); Scalability::SetQualityLevels(L); }
	for (TActorIterator<AFootball> It(GetWorld()); It; ++It) { Ball = *It; break; }
	AGoal* Home = nullptr; AGoal* Away = nullptr;
	for (TActorIterator<AGoal> It(GetWorld()); It; ++It) { if (It->DefendingTeam == ETeam::Home) Home = *It; else Away = *It; }
	if (Home && Away)
	{
		PitchCentre = (Home->GetActorLocation() + Away->GetActorLocation()) * 0.5f;
		PitchAxis = (Away->GetActorLocation() - Home->GetActorLocation()).GetSafeNormal2D();
		PitchHalfLength = FVector::Dist2D(Home->GetActorLocation(), Away->GetActorLocation()) * 0.5f;
	}
	else if (Ball) PitchCentre = Ball->GetActorLocation();
	UE_LOG(LogNunhead, Log, TEXT("Pitch centre (%.0f, %.0f), half length %.0f"), PitchCentre.X, PitchCentre.Y, PitchHalfLength);
	if (Ball)
	{
		GroundZ = Ball->GetActorLocation().Z;
		FHitResult H; FCollisionQueryParams P; P.AddIgnoredActor(Ball); const FVector S = Ball->GetActorLocation() + FVector(0, 0, 500.f);
		if (GetWorld()->LineTraceSingleByChannel(H, S, S - FVector(0, 0, 10000.f), ECC_Visibility, P)) GroundZ = H.ImpactPoint.Z;
		UE_LOG(LogNunhead, Log, TEXT("Pitch surface at Z = %.0f"), GroundZ);
	}
	TimeLeft = MatchLength;
	auto Load = [](const FString& P) -> USoundBase* { return P.IsEmpty() ? nullptr : LoadObject<USoundBase>(nullptr, *P); };
	CrowdLoop = Load(CrowdLoopPath); CrowdGoal = Load(CrowdGoalPath); CrowdGroan = Load(CrowdGroanPath); Whistle = Load(WhistlePath);
	Yay = Load(YayPath); Woohoo = Load(WoohooPath); Ooh = Load(OohPath); OhNo = Load(OhNoPath);
	if (USoundWave* W = Cast<USoundWave>(CrowdLoop)) W->bLooping = true;
	if (CrowdLoop) CrowdAC = UGameplayStatics::SpawnSound2D(this, CrowdLoop, CrowdVolume, 1.f, 0.f, nullptr, false, false);
	Feed(TEXT("Nunhead Green. Hold F / X to charge a shot, tap to pass, B calls the ball, jump to head it. Touch the ball to kick off."), 7.f);
}

void ANunheadGameMode::Play2D(USoundBase* Sound, float Volume) { if (Sound) UGameplayStatics::PlaySound2D(this, Sound, Volume); }

void ANunheadGameMode::StartMatch()
{
	ScoreHome = ScoreAway = 0; TimeLeft = MatchLength; bMatchOn = true; bFullTime = false; CelebrateT = 0; OutT = 0;
	Play2D(Whistle);
	Feed(TEXT("KICK OFF!  Bosco FC v Nunhead Rovers"), 3.f);
}

void ANunheadGameMode::EndMatch()
{
	bMatchOn = false; bFullTime = true;
	Play2D(Whistle); Play2D(Whistle, 0.8f);
	const FString Result = ScoreHome > ScoreAway ? TEXT("FULL TIME: Bosco win!") : ScoreHome < ScoreAway ? TEXT("FULL TIME: Rovers win") : TEXT("FULL TIME: a draw");
	if (ScoreHome > ScoreAway) { Play2D(CrowdGoal); Play2D(Woohoo); } else if (ScoreHome < ScoreAway) { Play2D(CrowdGroan); Play2D(OhNo); }
	Feed(Result, 8.f);
}

void ANunheadGameMode::Feed(const FString& Text, float Seconds) { Message = Text; MessageT = Seconds; UE_LOG(LogNunhead, Log, TEXT("%s"), *Text); }

void ANunheadGameMode::ResetPlay()
{
	if (Ball) Ball->ResetToSpawn();
	for (TActorIterator<ABotPlayer> It(GetWorld()); It; ++It) It->ReturnHome();
}

void ANunheadGameMode::BallInGoal(AGoal* Goal, AFootball* InBall)
{
	if (!bMatchOn || CelebrateT > 0.f || ReplayLock > 0.f || OutT > 0.f) return;
	// a keeper's throw-out or a called ball rolling in is never a goal
	if (InBall->LastKicker == TEXT("keeper") || InBall->LastKicker == TEXT("call")) { OutT = 1.2f; bThrowIn = false; Feed(TEXT("Goal kick")); return; }
	const bool bHomeScores = Goal->DefendingTeam == ETeam::Away;
	if (bHomeScores) ScoreHome++; else ScoreAway++;
	bLastGoalHome = bHomeScores; CelebrateT = 3.5f; ReplayLock = 1.f;
	Play2D(Whistle, 0.7f);
	if (bHomeScores) { Play2D(CrowdGoal); Play2D(FMath::RandBool() ? Yay : Woohoo); } else { Play2D(CrowdGroan); Play2D(OhNo); }
	Feed(bHomeScores ? TEXT("GOAL!!!  Bosco FC") : TEXT("Goal for the Rovers"), 3.5f);
	for (TActorIterator<ACamCharacter> It(GetWorld()); It; ++It) It->OnGoal(bHomeScores);
}

void ANunheadGameMode::Tick(float Dt)
{
	Super::Tick(Dt);
	Elapsed += Dt;
	if (AutoScreenshotSeconds > 0.f && !bShotTaken && Elapsed > AutoScreenshotSeconds) { bShotTaken = true; FScreenshotRequest::RequestScreenshot(TEXT("nunhead_auto.png"), true, false); UE_LOG(LogNunhead, Log, TEXT("screenshot requested")); }
	if (MessageT > 0.f) { MessageT -= Dt; if (MessageT <= 0.f) Message.Empty(); }
	if (ReplayLock > 0.f) ReplayLock -= Dt;
	if (CelebrateT > 0.f) { CelebrateT -= Dt; if (CelebrateT <= 0.f) { ResetPlay(); Play2D(Whistle, 0.6f); } return; }
	if (OutT > 0.f) { OutT -= Dt; if (OutT <= 0.f) { if (bThrowIn && Ball) Ball->PlaceAt(ThrowInSpot); else ResetPlay(); } return; }
	if (!bMatchOn)
	{
		// the match starts the first time a player kicks the ball (not a called ball, not the keeper)
		if (!bFullTime && Ball && (Ball->LastKicker == TEXT("cam") || Ball->LastKicker == TEXT("bot"))) StartMatch();
		return;
	}
	TimeLeft -= Dt;
	if (TimeLeft <= 0.f) { TimeLeft = 0.f; EndMatch(); return; }
	// out of play: behind a goal line (a near miss when it was Cam's shot), over the side, or lost down a hole
	if (Ball)
	{
		const FVector P = Ball->GetActorLocation(), Local = P - PitchCentre;
		const float Along = FVector::DotProduct(Local, PitchAxis), Across = FVector::DotProduct(Local, FVector::CrossProduct(FVector::UpVector, PitchAxis));
		const bool bBehindLine = FMath::Abs(Along) > PitchHalfLength + 60.f, bWide = FMath::Abs(Across) > PitchHalfWidth, bLost = P.Z < GroundZ - 400.f || FMath::Abs(Along) > PitchHalfLength + 1500.f;
		if (bBehindLine || bWide || bLost)
		{
			const bool bNearMiss = bBehindLine && FMath::Abs(Across) < 600.f && Ball->LastKicker == TEXT("cam");
			OutT = 1.6f; bThrowIn = bWide && !bBehindLine && !bLost;
			if (bThrowIn)
			{
				const FVector Side = FVector::CrossProduct(FVector::UpVector, PitchAxis);
				ThrowInSpot = PitchCentre + PitchAxis * FMath::Clamp(Along, -PitchHalfLength + 200.f, PitchHalfLength - 200.f) + Side * FMath::Sign(Across) * (PitchHalfWidth - 120.f);
				ThrowInSpot.Z = GroundZ + 40.f;
			}
			if (bNearMiss) { Play2D(CrowdGroan, 0.7f); Play2D(Ooh); Feed(TEXT("Ooh, just wide!")); }
			else Feed(bWide ? TEXT("Out of play. Throw in") : TEXT("Goal kick"));
		}
	}
}
